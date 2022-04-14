
use warp::{reject, ws::Message};
use serde::Serialize;

type WsSendError = tokio::sync::mpsc::error::SendError<Message>;

#[derive(Debug)]
pub enum ApplicationError {
    Message(String),
    Any(()),
    Json(serde_json::Error),
    Web(warp::Error),
    WebRTC(webrtc::Error),
    WsSend(WsSendError),
    DBPool(mobc::Error<tokio_postgres::Error>),
    DB(tokio_postgres::Error),
    Base64(base64::DecodeError),
    Decode(std::string::FromUtf8Error)
}

impl From<()> for ApplicationError {
    fn from(item: ()) -> Self {
        ApplicationError::Any(item)
    }
}

impl From<serde_json::Error> for ApplicationError {
    fn from(item: serde_json::Error) -> Self {
        ApplicationError::Json(item)
    }
}

impl From<warp::Error> for ApplicationError {
    fn from(item: warp::Error) -> Self {
        ApplicationError::Web(item)
    }
}

impl From<webrtc::Error> for ApplicationError {
    fn from(item: webrtc::Error) -> Self {
        ApplicationError::WebRTC(item)
    }
}

impl From<WsSendError> for ApplicationError {
    fn from(item: WsSendError) -> Self {
        ApplicationError::WsSend(item)
    }
}

impl From<mobc::Error<tokio_postgres::Error>> for ApplicationError {
    fn from(item: mobc::Error<tokio_postgres::Error>) -> ApplicationError {
        ApplicationError::DBPool(item)
    }
}

impl From<tokio_postgres::Error> for ApplicationError {
    fn from(item: tokio_postgres::Error) -> ApplicationError {
        ApplicationError::DB(item)
    }
}

impl From<base64::DecodeError> for ApplicationError {
    fn from(item: base64::DecodeError) -> ApplicationError {
        ApplicationError::Base64(item)
    }
}

impl From<std::string::FromUtf8Error> for ApplicationError {
    fn from(item: std::string::FromUtf8Error) -> ApplicationError {
        ApplicationError::Decode(item)
    }
}

impl reject::Reject for ApplicationError {}

#[derive(Serialize)]
pub struct ErrorMessage {
    pub code: u16,
    pub message: String,
}
