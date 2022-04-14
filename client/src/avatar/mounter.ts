import { Scene, Vector, CanvasProps } from './graphic';
import { Avatar, AvatarModelUtil, AvatarManager } from './avatar';
import {
	MessageType,
	Message,
	HelloMessage,
	MoveMessage,
	HelloResponseMessage,
} from './messaging';
import { AppData, MeetingRoomData, MeetingRoomModelHandleHolder, Member } from '../app-data-types';

const SPRITE_SRC= 'https://opengameart.org/sites/default/files/Green-Cap-Character-16x18.png';
const SPRITE_FRAMES_PER_CUT = 5;


const globalResizeEvents: Array<(event: UIEvent) => void> = [];
const globalKeyUpEvents: Array<(event: KeyboardEvent) => void> = [];
const globalKeydownEvents: Array<(event: KeyboardEvent) => void> = [];

window.addEventListener('resize', event => {
	globalResizeEvents.forEach(f => f.call(window, event));
});

window.addEventListener('keyup', event => {
	globalKeyUpEvents.forEach(f => f.call(window, event));
});

window.addEventListener('keydown', event => {
	globalKeydownEvents.forEach(f => f.call(window, event));
});

function initializeResizeEvent(data: MeetingRoomData, canvas: HTMLCanvasElement) {
	const resize = () => {
		const prop = new CanvasProps(canvas);
		data.canvasCssWidth = prop.cssWidth;
		data.canvasCssHeight = prop.cssHeight;
	};
	globalResizeEvents.push(resize);
	resize();
}

function startAvatarScene(
	trackId: string,
	dataChannel: RTCDataChannel, 
	data: MeetingRoomData, 
	appData: AppData, 
	canvas: HTMLCanvasElement,
	modelHandleHolder: MeetingRoomModelHandleHolder) {

	const scene = new Scene(canvas);
	const avatarManager = new AvatarManager(SPRITE_FRAMES_PER_CUT);

	avatarManager.onCollision((peer: Avatar, collide: boolean) => {
		peer.onCheckCollision(collide);
		if (collide) {
			modelHandleHolder.unmute(peer.myId);
		} else {
			modelHandleHolder.mute(peer.myId);
		}
	});

	doMount(
		trackId, 
		dataChannel, 
		data, 
		appData, 
		scene, 
		avatarManager, 
		modelHandleHolder
	);

	const tick = () => {
		scene.render();
		avatarManager.detectCollision();
		requestAnimationFrame(tick);
	};

	requestAnimationFrame(tick);

	globalResizeEvents.push(() => {
		const prop = new CanvasProps(scene.canvas);
		avatarManager.onresize(prop);
	});
}

function doMount(
	trackId: string,
	dataChannel: RTCDataChannel,
	data: MeetingRoomData,
	appData: AppData,
	scene: Scene, 
	avatarManager: AvatarManager,
	modelHandleHolder: MeetingRoomModelHandleHolder) {

	const member = appData.member;
	if (!member) {
		throw Error('Member is not set yet.');
	}


	dataChannel.onopen = () => {
		const position = new Vector(0, 0);
		const model = AvatarModelUtil.create(
			trackId, 
			member.memberName, 
			position, 
			new CanvasProps(scene.canvas)
		);
	
		const myAvatar = new Avatar(model, {
			imgSrc: SPRITE_SRC,
			framesPerCut: SPRITE_FRAMES_PER_CUT,
			position
		});
	
		data.avatars.push(model);
		modelHandleHolder.putAvatar(trackId, model);
	
		avatarManager.myAvatar = myAvatar;

		startApp(
			data, 
			scene, 
			dataChannel, 
			member, 
			myAvatar, 
			avatarManager, 
			modelHandleHolder
		);
	};

}

function startApp(
	data: MeetingRoomData, 
	scene: Scene, 
	dataChannel: RTCDataChannel, 
	member: Member,
	myAvatar: Avatar, 
	avatarManager: AvatarManager,
	modelHandleHolder: MeetingRoomModelHandleHolder) {

	dataChannel.onmessage = (event: MessageEvent) => {

		const { message } : { message: string } = JSON.parse(event.data);

		if (!message) {
			console.error('Invalid message format.', event.data);
			return;
		}

		const baseData = JSON.parse(message) as Message;

		switch(baseData.msgType) {
		case MessageType.Hello: {
			const msgData = baseData as HelloMessage;
			const peerId = msgData.id;

			const position = new Vector(0, 0);
			const model = AvatarModelUtil.create(
				peerId, 
				msgData.name, 
				position, 
				new CanvasProps(scene.canvas)
			);

			const peer = new Avatar(model, {
				imgSrc: SPRITE_SRC,
				framesPerCut: SPRITE_FRAMES_PER_CUT,
				position
			});

			data.avatars.push(model);
			modelHandleHolder.putAvatar(peerId, model);

			avatarManager.add(peerId, peer);
			scene.add(peer);

			const res = myAvatar.toMoveMessage();
			console.log('Response to hello', res);

			const dataToSend: HelloResponseMessage = {
				msgType: MessageType.HelloResponse,
				id: myAvatar.myId,
				name: member.memberName,
				direction: res.direction,
				coord: res.coord
			};
			dataChannel.send(JSON.stringify(dataToSend));
			break;
		}
		case MessageType.HelloResponse: {
			const msgData = baseData as HelloResponseMessage;
			const peerId = msgData.id;
			if (avatarManager.has(peerId)) {
				break;
			}

			const position = new Vector(msgData.coord.x, msgData.coord.y);
			const model = AvatarModelUtil.create(
				peerId, 
				msgData.name, 
				position, 
				new CanvasProps(scene.canvas)
			);

			const peer = new Avatar(model, {
				imgSrc: SPRITE_SRC,
				framesPerCut: SPRITE_FRAMES_PER_CUT,
				position,
				direction: msgData.direction
			});

			data.avatars.push(model);
			modelHandleHolder.putAvatar(peerId, model);
			
			avatarManager.add(peerId, peer);
			scene.add(peer);
			break;
		}
		case MessageType.Move: {
			const msgData = baseData as MoveMessage;
			const peerId = msgData.id;
			avatarManager.ifPresent(peerId, peer => {
				peer.moveTo(msgData.coord.x, msgData.coord.y, msgData.direction);
			});
			break;
		}
		case MessageType.Stop: {
			const msgData = baseData as Message;
			const peerId = msgData.id;
			avatarManager.ifPresent(peerId, peer => peer.stop());
			break;
		}
		default:
			break;

		}
	};

	modelHandleHolder.onDelete(peerId => {
		avatarManager.ifPresent(peerId, peer => {
			scene.remove(peer);

			for (let i = 0; i < data.avatars.length; i++) {
				const av = data.avatars[i];
				if (av && av.id === peerId) {
					data.avatars.splice(i, 1);
					break;
				}
			}
		});
		avatarManager.delete(peerId);
	});

	dataChannel.onclose = () => {
		globalKeyUpEvents.length = 0;
		globalKeydownEvents.length = 0;
	};

	globalKeyUpEvents.push(event => {

		switch (event.key) {
		case 'ArrowDown':
		case 'ArrowUp':
		case 'ArrowLeft':
		case 'ArrowRight': {
			myAvatar.stop();
			const dataToSend: Message = {
				msgType: MessageType.Stop,
				id: myAvatar.myId
			};
			dataChannel.send(JSON.stringify(dataToSend));
			break;
		}
		default:
			return;
		}
	});

	globalKeydownEvents.push(event => {

		const send = () => dataChannel.send(JSON.stringify(myAvatar.toMoveMessage()));
		switch (event.key) {
		case 'ArrowDown':
			myAvatar.down();
			send();
			break;
		case 'ArrowUp':
			myAvatar.up();
			send();
			break;
		case 'ArrowLeft':
			myAvatar.left();
			send();
			break;
		case 'ArrowRight':
			myAvatar.right();
			send();
			break;
		default:
			return;
		}
		event.preventDefault();
	});

	const dataToSend: HelloMessage = {
		id: myAvatar.myId,
		msgType: MessageType.Hello,
		name: member.memberName
	};
	dataChannel.send(JSON.stringify(dataToSend));

	scene.add(myAvatar);
}

export {
	initializeResizeEvent,
	startAvatarScene
};