use std::convert::From;
use std::sync::{Arc, Mutex};

use futures::{SinkExt, StreamExt};
use tokio::sync::mpsc::unbounded_channel;
use tokio_stream::wrappers::UnboundedReceiverStream;
use warp::{http::StatusCode, Filter, Rejection, Reply};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::interceptor::registry::Registry;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
// use webrtc::peer_connection::policy::ice_transport_policy::RTCIceTransportPolicy;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::RTPCodecType;
use webrtc::rtp_transceiver::rtp_receiver::RTCRtpReceiver;
// use webrtc::rtp_transceiver::rtp_sender::RTCRtpSender;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_remote::TrackRemote;

use webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;

use dotenv::dotenv;
use log::{error, info, warn};

mod data;
mod errors;
mod handler;
mod ice;
mod logger;

use crate::data::{DBPool, MemberToken, RoomMember, RoomMemberDao};
use crate::errors::ApplicationError;
use crate::handler::{
    MessageToPublisher, PeerManager, PeerManagerRef, RTCPToPublisher, SubscriberMessage,
    SubscriberMessageType, ToSubscriberDataChannelMessage,
};

const SECRET_HEADER_KEY: &str = "X-W-Chat-Secret";

#[derive(Deserialize, Serialize, Debug)]
struct OfferBody {
    sdp: String,
    _type: String,
}

#[derive(Serialize)]
struct MessageResponse {
    message: String,
}

#[derive(Serialize)]
struct NameResponse {
    name: String,
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    logger::init_logger();

    let db_pool = data::create_db_pool();

    let context = warp::path("app");
    let ws_context = warp::path("ws-app");
    let peer_manager = Arc::new(Mutex::new(PeerManager::new()));

    let ice_servers = context
        .and(warp::path("ice-servers"))
        .and(warp::header(SECRET_HEADER_KEY))
        .and(with_db(db_pool.clone()))
        .and_then(ice_servers);

    let member_name = context
        .and(warp::path("member-name"))
        .and(warp::header(SECRET_HEADER_KEY))
        .and(warp::path::param())
        .and(with_db(db_pool.clone()))
        .and(with_peer_manager(peer_manager.clone()))
        .and_then(member_name);

    let subscribe = ws_context
        .and(warp::path("subscribe"))
        .and(warp::path::param())
        .and(warp::ws())
        .and(with_peer_manager(peer_manager.clone()))
        .and(with_db(db_pool.clone()))
        .map(
            |token: String,
             ws: warp::ws::Ws,
             peer_manager: PeerManagerRef,
             room_member_dao: RoomMemberDao| {
                ws.on_upgrade(|websocket| {
                    handle_peer(token, websocket, peer_manager, room_member_dao)
                })
            },
        );

    let route = ice_servers
                    .or(member_name)
                    .or(subscribe)
                    .recover(handle_rejection);

    warp::serve(route).run(([0, 0, 0, 0], 8082)).await;
}

fn with_db(
    db_pool: DBPool,
) -> impl Filter<Extract = (RoomMemberDao,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || RoomMemberDao::new(db_pool.clone()))
}

fn with_peer_manager(
    peer_manager: PeerManagerRef,
) -> impl Filter<Extract = (PeerManagerRef,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || peer_manager.clone())
}

/// The endpoint serving the dictionaries of ice servers.
///
/// The response JSON can be parsed to an array of 'RTCIceServer'.
///
async fn ice_servers(
    token: String,
    room_member_dao: RoomMemberDao,
) -> Result<impl Reply, Rejection> {
    if let Err(e) = check_member_token(token, room_member_dao).await {
        return Ok(e);
    }

    let ice_servers = ice::create_ice_server_config_for_browser("client");
    Ok(ok_with_json(&ice_servers))
}

async fn member_name(
    token: String,
    peer_id: String,
    room_member_dao: RoomMemberDao,
    peer_manager: PeerManagerRef,
) -> Result<impl Reply, Rejection> {
    if let Err(e) = check_member_token(token, room_member_dao).await {
        return Ok(e);
    }

    let peer_id = match Uuid::parse_str(&peer_id) {
        Ok(peer_id) => peer_id,
        Err(e) => {
            error!("{:?}", e);
            return Ok(resp_with_message(
                "Invalid id format".to_owned(),
                StatusCode::BAD_REQUEST,
            ));
        }
    };

    let peer_manager = peer_manager.lock().unwrap();
    let name = if let Some(name) = peer_manager.get_name_by_peer_id(&peer_id) {
        name
    } else {
        "-".to_owned()
    };

    Ok(ok_with_json(&NameResponse { name }))
}

async fn check_member_token(
    token: String,
    room_member_dao: RoomMemberDao,
) -> Result<RoomMember, warp::reply::WithStatus<warp::reply::Json>> {
    let member_token = match MemberToken::decode(&token) {
        Ok(mt) => mt,
        Err(e) => {
            error!("{:?}", e);
            return Err(resp_with_message(
                "Invalid token".to_owned(),
                StatusCode::UNAUTHORIZED,
            ));
        }
    };

    room_member_dao
        .find_room_member(&member_token.member_id, &member_token.secret_token)
        .await
        .map_err(|e| {
            error!("{:?}", e);
            resp_with_message("Invalid token".to_owned(), StatusCode::UNAUTHORIZED)
        })
}

async fn fetch_room_member(
    token: String,
    room_member_dao: RoomMemberDao,
) -> Result<RoomMember, ApplicationError> {
    let member_token = MemberToken::decode(&token)?;

    room_member_dao
        .find_room_member(&member_token.member_id, &member_token.secret_token)
        .await
}

/// Handles the upgrade request for Websocket and initializes RTCPeerConnection.
///
async fn handle_peer(
    token: String,
    ws: warp::ws::WebSocket,
    peer_manager: PeerManagerRef,
    room_member_dao: RoomMemberDao,
) {
    if let Err(e) = handle_peer_delegate(token, ws, peer_manager, room_member_dao).await {
        error!("Error on handle_subscribe {:?}.", e);
    }
}

async fn handle_peer_delegate(
    token: String,
    ws: warp::ws::WebSocket,
    peer_manager: PeerManagerRef,
    room_member_dao: RoomMemberDao,
) -> Result<(), ApplicationError> {
    let room_member = fetch_room_member(token, room_member_dao).await?;

    let peer_id = Uuid::new_v4();

    let (mut tx_ws, mut rx_ws) = ws.split();
    let (tx_ws_facade, rx_ws_facade) = unbounded_channel();
    let mut rx_ws_facade: UnboundedReceiverStream<warp::ws::Message> =
        UnboundedReceiverStream::new(rx_ws_facade);

    let (tx_main_to_subscriber, rx_main_to_subscriber) = unbounded_channel();
    let mut rx_main_to_subscriber: UnboundedReceiverStream<SubscriberMessage> =
        UnboundedReceiverStream::new(rx_main_to_subscriber);

    let (tx_main_to_publisher, rx_main_to_publisher) = unbounded_channel();
    let mut rx_main_to_publisher: UnboundedReceiverStream<MessageToPublisher> =
        UnboundedReceiverStream::new(rx_main_to_publisher);

    let (tx_data_to_subscriber, rx_data_to_subscriber) = unbounded_channel();
    let rx_data_to_subscriber: UnboundedReceiverStream<ToSubscriberDataChannelMessage> =
        UnboundedReceiverStream::new(rx_data_to_subscriber);
    {
        let mut peer_manager = peer_manager.lock().unwrap();
        peer_manager.add_peer(
            &peer_id,
            room_member,
            tx_main_to_publisher,
            tx_main_to_subscriber.clone(),
            tx_data_to_subscriber.clone(),
        );
    }

    //
    // Send messages through websocket connection to the peer.
    //
    tokio::spawn(async move {
        while let Some(msg) = rx_ws_facade.next().await {
            if let Err(e) = tx_ws.send(msg).await {
                error!("{:?} on {:?}.", e, peer_id);
            }
        }
    });

    let peer_connection = Arc::new(new_base_peer_connection().await?);

    peer_connection
        .add_transceiver_from_kind(RTPCodecType::Video, &[])
        .await?;
    peer_connection
        .add_transceiver_from_kind(RTPCodecType::Audio, &[])
        .await?;

    let (local_track_chan_tx, mut local_track_chan_rx) =
        tokio::sync::mpsc::channel::<Arc<TrackLocalStaticRTP>>(2);

    let (track_ssrc_tx, mut track_ssrc_rx) =
        tokio::sync::mpsc::channel::<webrtc::rtp_transceiver::SSRC>(1);

    let local_track_chan_tx = Arc::new(local_track_chan_tx);
    let track_ssrc_tx = Arc::new(track_ssrc_tx);

    //
    // Create a data channel
    //
    let data_channel = peer_connection
        .create_data_channel(&format!("sfu-data-ch-{}", peer_id), None)
        .await?;
    // Register channel opening handling
    let data_ch_for_open = Arc::clone(&data_channel);
    data_channel
        .on_open(Box::new(move || {
            info!("Data channel opens on {:?}.", peer_id);

            let data_ch_to_send = Arc::clone(&data_ch_for_open);

            Box::pin(async move {
                handler::on_data_channel_open(&peer_id, data_ch_to_send, rx_data_to_subscriber)
                    .await;
            })
        }))
        .await;

    // Register text message handling
    let peer_manager_for_data_ch = peer_manager.clone();
    data_channel
        .on_message(Box::new(move |msg: DataChannelMessage| {
            let msg_str = match String::from_utf8(msg.data.to_vec()) {
                Ok(msg) => msg,
                Err(e) => {
                    error!("{:?} on {:?}.", e, peer_id);
                    return Box::pin(async {});
                }
            };
            let peer_manager = peer_manager_for_data_ch.lock().unwrap();
            peer_manager.send_data_to_subscribers(&peer_id, msg_str);

            Box::pin(async {})
        }))
        .await;
    //
    // In order to publish a video and an audio, this pc should handle tracks from the client.
    //
    peer_connection
        .on_track(Box::new(
            move |track: Option<Arc<TrackRemote>>, _receiver: Option<Arc<RTCRtpReceiver>>| {
                handler::on_track(
                    &peer_id,
                    track,
                    track_ssrc_tx.clone(),
                    local_track_chan_tx.clone(),
                );

                Box::pin(async {})
            },
        ))
        .await;

    let peer_manager_for_state_change = peer_manager.clone();
    peer_connection
        .on_peer_connection_state_change(Box::new(move |s: RTCPeerConnectionState| {
            handler::on_peer_connection_state_change(
                s,
                &peer_id,
                peer_manager_for_state_change.clone(),
            );

            Box::pin(async {})
        }))
        .await;

    let peer_manager_for_track_add = peer_manager.clone();
    tokio::spawn(async move {
        loop {
            if let Some(track) = local_track_chan_rx.recv().await {
                let mut peer_manager = peer_manager_for_track_add.lock().unwrap();
                peer_manager.add_track(&peer_id, track);

                if peer_manager.has_both_audio_and_video(&peer_id) {
                    peer_manager.send_to_subscribers(
                        &peer_id,
                        SubscriberMessage {
                            msg_type: SubscriberMessageType::Start,
                            message: String::from(""),
                        },
                    );
                    info!("Both audio and video track are added to {:?}.", peer_id);
                    break;
                }
            }
        }
    });

    //
    // Forwards RTCP packets to the sender of the media stream.
    //
    let rtcp_observer_pc = peer_connection.clone();
    tokio::spawn(async move {
        if let Some(ssrc) = track_ssrc_rx.recv().await {
            info!("SSRC {:?} detected on {:?}.", ssrc, peer_id);

            while let Some(msg) = rx_main_to_publisher.next().await {
                match msg {
                    MessageToPublisher::RTCP(packet_type) => match packet_type {
                        RTCPToPublisher::PLI => {
                            if let Err(e) = rtcp_observer_pc
                                .write_rtcp(&[Box::new(PictureLossIndication {
                                    sender_ssrc: 0,
                                    media_ssrc: ssrc,
                                })])
                                .await
                            {
                                error!("{:?} on {:?}.", e, peer_id);
                            }
                        }
                    },
                }
            }
        }
    });

    //
    // Detect 'negotiation needed' events to send an offer.
    // Reference: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
    //
    let pc_for_renegotiation = peer_connection.clone();
    let tx_ws_facade_for_renegotiation = tx_ws_facade.clone();
    peer_connection
        .on_negotiation_needed(Box::new(move || {
            let pc_for_renegotiation = pc_for_renegotiation.clone();
            let tx_ws_facade_for_renegotiation = tx_ws_facade_for_renegotiation.clone();

            handler::on_negotiation_needed(
                &peer_id,
                pc_for_renegotiation,
                tx_ws_facade_for_renegotiation,
            );

            Box::pin(async {})
        }))
        .await;

    let tx_ws_facade_for_ice_candidate = tx_ws_facade.clone();
    peer_connection
        .on_ice_candidate(Box::new(move |candidate| {
            let candidate = if let Some(candidate) = candidate {
                candidate
            } else {
                warn!("ICE candidate is not present on {:?}", peer_id);
                return Box::pin(async {});
            };

            handler::on_ice_candidate(&peer_id, candidate, tx_ws_facade_for_ice_candidate.clone());

            Box::pin(async {})
        }))
        .await;

    //
    // The main event loop that handles messages for negotiation.
    //

    tokio::spawn(async move {
        while let Some(msg) = rx_main_to_subscriber.next().await {
            let pc_for_prepare = peer_connection.clone();
            let tx_ws_facade_for_prepare = tx_ws_facade.clone();
            match msg.msg_type {
                SubscriberMessageType::Prepare => {
                    info!("Preparation is requested on {:?}.", peer_id);

                    if let Err(e) =
                        handler::do_offer(pc_for_prepare, tx_ws_facade_for_prepare).await
                    {
                        error!("{:?} on {:?}.", e, peer_id);
                    }
                }
                SubscriberMessageType::IceCandidate => {
                    if let Err(e) =
                        handler::handle_ice_candidate_message(&peer_id, &msg, pc_for_prepare).await
                    {
                        error!("{:?} on {:?}.", e, peer_id);
                    }
                }
                SubscriberMessageType::Answer => {
                    if let Err(e) =
                        handler::handle_answer_message(&peer_id, &msg, pc_for_prepare).await
                    {
                        error!("{:?} on {:?}", e, peer_id);
                    }
                }
                SubscriberMessageType::Start => {
                    if let Err(e) = handler::handle_start_message(
                        &peer_id,
                        pc_for_prepare,
                        peer_manager.clone(),
                        tx_ws_facade_for_prepare,
                    )
                    .await
                    {
                        error!("{:?} on {:?}", e, peer_id);
                    }
                }
                SubscriberMessageType::Offer => {
                    error!(
                        "Receiving offers is currently not supported ({:?}).",
                        peer_id
                    );
                    continue;
                }
            }
        }
    });

    while let Some(msg) = rx_ws.next().await {
        match msg.map_err(ApplicationError::Web).and_then(|msg| {
            msg.to_str().map_err(ApplicationError::Any).and_then(|s| {
                serde_json::from_str::<SubscriberMessage>(&s).map_err(ApplicationError::Json)
            })
        }) {
            Ok(msg) => {
                if let Err(e) = tx_main_to_subscriber.send(msg) {
                    error!("{:?} on {:?}.", e, peer_id)
                }
            }
            Err(e) => error!("{:?} on {:?}.", e, peer_id),
        }
    }

    Ok(())
}

async fn new_base_peer_connection() -> Result<RTCPeerConnection, webrtc::Error> {
    let mut m = MediaEngine::default();
    m.register_default_codecs()?;
    let mut registry = Registry::new();
    registry = register_default_interceptors(registry, &mut m)?;

    let api = APIBuilder::new()
        .with_media_engine(m)
        .with_interceptor_registry(registry)
        .build();

    let ice_servers = ice::create_ice_server_config("sfu");
    let config = RTCConfiguration {
        ice_servers: ice_servers,
        // ice_transport_policy: RTCIceTransportPolicy::Relay,
        ..Default::default()
    };

    api.new_peer_connection(config).await
}

fn ok_with_json<T>(data: &T) -> warp::reply::WithStatus<warp::reply::Json>
where
    T: Serialize,
{
    warp::reply::with_status(warp::reply::json(data), StatusCode::OK)
}

fn resp_with_message(
    message: String,
    status_code: StatusCode,
) -> warp::reply::WithStatus<warp::reply::Json> {
    warp::reply::with_status(warp::reply::json(&MessageResponse { message }), status_code)
}

async fn handle_rejection(err: Rejection) -> Result<impl Reply, std::convert::Infallible> {
    error!("handle_rejection {:?}", err);
    Ok(warp::reply::with_status(
        "Internal Server Error",
        StatusCode::INTERNAL_SERVER_ERROR,
    ))
}
