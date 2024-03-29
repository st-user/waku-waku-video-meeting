import { reactive } from 'vue';
import { Member, VideoWindow, VideoModel, MeetingRoomData, MeetingRoomModelHandleHolder } from '../app-data-types';
import { backToHomeWithDelay, handleUnrecoverableError } from '../system';

const SECRET_HEADER_KEY = 'X-W-Chat-Secret';

const TRACK_ID_PREF = 'sfu-stream-';
const DATA_CHANNEL_LABEL_PREF = 'sfu-data-ch-';

enum SubscriberMessageType {
	Offer = 'Offer',
	Answer = 'Answer',
	Start = 'Start',
	Prepare = 'Prepare',
	IceCandidate = 'IceCandidate',
	Ping = 'Ping',
	Pong = 'Pong',
}

interface SubscriberMessage {
	msg_type: SubscriberMessageType,
	message: string
}

const VIDEO_HEIGHT_RATIO = 0.25;
const PING_INTERVAL_MILLIS = 3000;
const WAIT_BEFORE_REMOVAL_MILLIS = 5000;

class ConnectionHandler {
	
	private socket: WebSocket | undefined;
	private readonly globalResizeEvents: Array<(event: UIEvent) => void> = [];
	
	constructor() {
		window.addEventListener('resize', event => {
			this.globalResizeEvents.forEach(f => f.call(window, event));
		});
	}
	
	async init(
		data: MeetingRoomData, 
		member: Member,
		modelHandleHolder: MeetingRoomModelHandleHolder,
		dataChannelSetUpper: (trackId: string, dc: RTCDataChannel) => void): Promise<void> {
			
		// TODO more concise way
		this.globalResizeEvents.push(() => {
			data.myVideoCssHeight = window.innerHeight * VIDEO_HEIGHT_RATIO; 
		});		

		const pc = await this.initRTCPeerConnection(data, member, modelHandleHolder);

		const isHttps = location.protocol.startsWith('https:');
		const scheme = isHttps ? 'wss:' : 'ws:';
		this.socket = new WebSocket(`${scheme}//${location.host}/ws-app/subscribe/${member.tokenToSend}`);

		pc.addEventListener('icecandidate', (event: RTCPeerConnectionIceEvent) => {
			this.sendMessage(JSON.stringify({
				msg_type: SubscriberMessageType.IceCandidate,
				message: JSON.stringify(event.candidate)
			}));
		});
		pc.addEventListener('datachannel', (event: RTCDataChannelEvent) => {

			const dataChannel = event.channel;
			dataChannelSetUpper(
				dataChannel.label.replace(DATA_CHANNEL_LABEL_PREF, TRACK_ID_PREF), 
				dataChannel
			);
		});

		const sendPing = () => {
			const msg: SubscriberMessage = {
				msg_type: SubscriberMessageType.Ping,
				message: ''
			};
			this.sendMessage(JSON.stringify(msg));
			setTimeout(sendPing, PING_INTERVAL_MILLIS);
		};
		this.socket.addEventListener('open', () => {
			const msg: SubscriberMessage = {
				msg_type: SubscriberMessageType.Prepare,
				message: ''
			};
			this.sendMessage(JSON.stringify(msg));
			setTimeout(sendPing, PING_INTERVAL_MILLIS);
		});
		this.socket.addEventListener('error', handleUnrecoverableError);
		this.socket.addEventListener('close', handleUnrecoverableError);

		this.socket.addEventListener('message', async (event: MessageEvent) => {

			const message = JSON.parse(event.data) as SubscriberMessage;

			switch (message.msg_type) {
			case SubscriberMessageType.Offer: {

				if (!message.message) {
					console.error('Invalid message format', message);
					break;
				}

				const offer = JSON.parse(message.message);
				console.debug('---------------------- offer -----------------------------');
				console.debug(offer.sdp);
				console.debug('---------------------- offer -----------------------------');

				// TODO Resolve:
				// "Uncaught (in promise) DOMException: Failed to execute 'setRemoteDescription' on 'RTCPeerConnection': Failed to set remote offer sdp: Duplicate a=mid value '2'."
				//
				await pc.setRemoteDescription(offer).catch(reason => {
					handleUnrecoverableError();
					throw Error(reason);
				});
				await pc.setLocalDescription(await pc.createAnswer());
				// await this.gatherIceCandidate(pc);
				const answer = pc.localDescription;

				if (!answer) {
					console.error('Answer is null');
					break;
				}
				console.debug('---------------------- answer -----------------------------');
				console.debug(answer.sdp);
				console.debug('---------------------- answer -----------------------------');

				this.sendMessage(JSON.stringify({
					msg_type: SubscriberMessageType.Answer,
					message: JSON.stringify(answer)
				}));
				break;
			}
			case SubscriberMessageType.IceCandidate: {
				const iceCandidate = JSON.parse(message.message);
				console.debug('Receive ICE candidate: ', iceCandidate);
				pc.addIceCandidate(iceCandidate);
				break;
			}
			case SubscriberMessageType.Pong: {
				console.debug('Receive Pong message.');
				break;
			}
			default:
				break;
			}
		});
	}

	private async initRTCPeerConnection(
		data: MeetingRoomData,
		member: Member,
		modelHandleHolder: MeetingRoomModelHandleHolder): Promise<RTCPeerConnection> {

		const pc = await this.newRTCPeerConnection(member);

		pc.ontrack = (event: RTCTrackEvent) => {
			const mediaStream = event.streams[0];
			if (!mediaStream) {
				return;
			}
			const videoId = mediaStream.id;

			console.debug('on_track', event.track);

			if (videoId.startsWith(TRACK_ID_PREF) && event.track.kind === 'video') {

				// https://stackoverflow.com/questions/34990672/control-volume-gain-for-video-audio-stream-in-firefox
				const audioTrack = mediaStream.getAudioTracks()[0];
				const videoTrack = mediaStream.getVideoTracks()[0];
				if (!audioTrack || !videoTrack) {
					return;
				}
				const audio = new Audio();
				audio.srcObject = new MediaStream([ audioTrack ]);
				audio.onloadedmetadata = () => {
					audio.play();
				};

				const videoStream  = new MediaStream([ videoTrack ]);

				const videoWindow: VideoWindow = reactive({
					id: videoId,
					name: '',
					srcObject: videoStream,
					isDisplayed: false,
					cssHeight: window.innerHeight * VIDEO_HEIGHT_RATIO
				});

				fetchMemberName(videoId.replace(TRACK_ID_PREF, ''), member.tokenToSend)
					.then(({ name }: { name: string }) => {
						videoWindow.name = name;
					});

				this.globalResizeEvents.push(() => {
					videoWindow.cssHeight = window.innerHeight * VIDEO_HEIGHT_RATIO; 
				});

				const videoModel: VideoModel = {
					videoWindow,
					audio
				};

				modelHandleHolder.putVideo(videoId, videoModel);
				modelHandleHolder.mute(videoId);

				data.videos.push(videoWindow);

				let removeTimer;
				event.track.onunmute = () => {
					console.debug(`unmute ${videoId}`);
					modelHandleHolder.play(videoId);
					clearTimeout(removeTimer);
				};
				event.track.onmute = () => {
					modelHandleHolder.leave(videoId);

					removeTimer = setTimeout(() => {
						console.debug(`mute ${videoId}`);
						for (let i = 0; data.videos.length; i++) {
							const video = data.videos[i];
							if (!video) {
								continue;
							}
							if (videoId === video.id) {
								console.debug(`Remove the video whose index is ${i}`);
								data.videos.splice(i, 1);
								break;
							}
						}
						modelHandleHolder.delete(videoId);
					}, WAIT_BEFORE_REMOVAL_MILLIS);
				};
			}
		};
		const stream = await navigator.mediaDevices.getUserMedia({
			video: true,
			audio: true
		}).catch(reason => {
			backToHomeWithDelay(
				'This application requires to be allowed to access camera and microphone. Please review the site settings of your browser and retry.'
			);
			throw Error(reason);
		});

		
		const myVideo = stream.getVideoTracks()[0];
		if (!myVideo) {
			throw Error('Video track does not exist.');
		}
		myVideo.onended = () => console.debug('My video ended.');
		myVideo.onmute = () => console.debug('My video muted.');
		myVideo.onunmute = () => console.debug('My video unmuted.');

		data.srcObject = new MediaStream( [ myVideo ]);
		

		stream.getTracks()
			.forEach(track => pc.addTrack(track, stream));

		return pc;
	}

	private async newRTCPeerConnection(member: Member): Promise<RTCPeerConnection> {
		const iceServers = await fetchIceServers(member.tokenToSend);

		const newIceServers: RTCIceServer[] = [];
		iceServers.forEach(is => newIceServers.push(is)); 

		if (member.useStableMode) {
			iceServers.map(iceServer => {
				const urls = iceServer.urls;
				let newUrls: string | string[] = '';
				if (typeof urls === 'string') {
					newUrls = `${urls}?transport=tcp`;
				} else {
					newUrls = urls.map(u => `${u}?transport=tcp`);
				}
				return {
					urls: newUrls,
					username: iceServer.username,
					credential: iceServer.credential,
					credentialType: iceServer.credentialType
				} as RTCIceServer;
			}).forEach(is => newIceServers.push(is));
		}
		const iceTransportPolicy = member.useStableMode ? 'relay' : 'all';
		const config = {
			iceServers: newIceServers,
			iceTransportPolicy,
		} as RTCConfiguration;

		console.debug(newIceServers);
		return new RTCPeerConnection(config);
	}

	private sendMessage(text: string): void {
		if (!this.socket) {
			console.error('Socket is null');
			return;
		}
		this.socket.send(text);
	}
}

async function fetchMemberName(peerId: string, tokenToSend): Promise<{ name: string}> {
	return await fetch(`/app/member-name/${peerId}`, {
		headers: {
			[SECRET_HEADER_KEY]: tokenToSend
		}
	}).then(res => res.json()) as { name: string };	
}

async function fetchIceServers(tokenToSend: string): Promise<Array<RTCIceServer>> {
	return await fetch('/app/ice-servers', {
		headers: {
			[SECRET_HEADER_KEY]: tokenToSend
		}
	}).then(res => res.json()) as Array<RTCIceServer>;
}

export {
	ConnectionHandler
};