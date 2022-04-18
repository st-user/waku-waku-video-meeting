import { CanvasProps, BaseSceneObject, Vector } from './graphic';
import { reactive } from 'vue';
import { AvatarDirection, MessageType ,MoveMessage } from './messaging';
import { AvatarModel, AvatarState } from '../app-data-types';

const SPRITE_UNIT_WIDTH = 16;
const SPRITE_UNIT_HEIGHT = 18;
const SPRITE_SCALE = 5;


const SPRITE_IMAGE_WIDTH = SPRITE_UNIT_WIDTH * SPRITE_SCALE;
const SPRITE_IMAGE_HEIGHT = SPRITE_UNIT_HEIGHT * SPRITE_SCALE;

const AVATAR_NAME_FONT_SIZE = 24;


class AvatarModelUtil {

	static create(
		id: string,
		name: string, 
		defaultPosition: 
		Vector, prop: 
		CanvasProps): AvatarModel {

		const xy = Avatar.calcCanvasTopLeftXY(defaultPosition, prop);
		const { top, left } = prop.calcAbsTopLeft(xy.x, xy.y);

		return reactive({
			id, name,
			top: top - AVATAR_NAME_FONT_SIZE,
			left,
			talking: false,
			state: AvatarState.Playing
		});
	}
}

class Avatar extends BaseSceneObject {

	private static readonly Forwards = new Map([
		[AvatarDirection.UP, new Vector(0, 1)],
		[AvatarDirection.RIGHT, new Vector(1, 0)],
		[AvatarDirection.DOWN, new Vector(0, -1)],
		[AvatarDirection.LEFT, new Vector(-1, 0)],
	]);

	private readonly avatarModel: AvatarModel;

	private readonly img: HTMLImageElement;

	private loaded: boolean;
	private currentDirection: AvatarDirection;
	private currentCut: number;

	private stopped: boolean;

	private frameIndex: number;
	private readonly framesPerCut: number;


	private readonly position: Vector;

	private previousTopLeft: { x: number, y: number} | undefined;

	constructor(
		avatarModel: AvatarModel,
		param: {
			imgSrc: string,
			framesPerCut: number,
			position?: Vector,
			direction?: AvatarDirection
	}) {
		super();
		this.avatarModel = avatarModel;
		this.img = new Image();
		this.img.src = param.imgSrc;
		this.loaded = false;
		this.img.onload = () => {
			this.loaded = true;
		};
		this.currentDirection = !param.direction ? AvatarDirection.DOWN : param.direction;
		this.currentCut = 0;
		this.stopped = true;
		this.frameIndex = 0;
		this.framesPerCut = param.framesPerCut;
		this.position = !param.position ? new Vector(0, 0) : param.position;
	}

	static calcCanvasTopLeftXY(position: Vector, prop: CanvasProps): { x: number, y: number } {
		const canvasPos = position.toCanvasXY(prop.width, prop.height);
		return {
			x: canvasPos.x - SPRITE_IMAGE_WIDTH / 2,
			y: canvasPos.y - SPRITE_IMAGE_HEIGHT / 2
		};
	}

	get myId() {
		return this.avatarModel.id;
	}

	get center(): Vector {
		return new Vector(
			this.position.x + SPRITE_IMAGE_WIDTH / 2,
			this.position.y - SPRITE_IMAGE_HEIGHT / 2
		);
	}

	up(): void {
		this.changeDirection(AvatarDirection.UP);
		this.movePosition(0, 5);
	}

	left(): void {
		this.changeDirection(AvatarDirection.LEFT);
		this.movePosition(-5, 0);
	}

	down(): void {
		this.changeDirection(AvatarDirection.DOWN);
		this.movePosition(0, -5);
	}

	right(): void {
		this.changeDirection(AvatarDirection.RIGHT);
		this.movePosition(5, 0);
	}

	toMoveMessage(): MoveMessage {
		return {
			id: this.avatarModel.id,
			msgType: MessageType.Move,
			direction: this.currentDirection,
			coord: { x: this.position.x, y: this.position.y }
		} as MoveMessage;
	}

	moveTo(x: number, y: number, d: AvatarDirection): void {
		this.changeDirection(d);
		this.position.set(x, y);
	}

	private changeDirection(d: AvatarDirection): void {
		this.stopped = false;
		if (this.currentDirection === d) {
			return;
		}
		this.frameIndex = this.framesPerCut;
		this.currentCut = 0;
		this.currentDirection = d;
	}
	
	private movePosition(x: number, y: number) {
		this.position.add(x, y);
	}

	stop(): void {
		this.stopped = true;
		this.currentCut = 0;
	}

	move(): void {
		if (!this.stopped) {
			this.currentCut = (this.currentCut + 1) % 3;
		}
	}

	override render(prop: CanvasProps): void {
		if (this.frameIndex !== this.framesPerCut) {
			this.frameIndex++;
			return;
		}
		this.frameIndex = 0;
		if (!this.loaded) {
			return;
		}
		this.move();
		this.drawImage(this.currentCut, this.currentDirection, prop);	
	}

	private drawImage(hPos: number, vPos: number, prop: CanvasProps): void {

		const xy = Avatar.calcCanvasTopLeftXY(this.position, prop);
		const canvasTopLeftX = xy.x;
		const canvasTopLeftY = xy.y;

		this.clear(prop);

		prop.ctx.drawImage(
			this.img, 
			SPRITE_UNIT_WIDTH * hPos, 
			SPRITE_UNIT_HEIGHT * vPos, 
			SPRITE_UNIT_WIDTH, 
			SPRITE_UNIT_HEIGHT, 
			canvasTopLeftX, 
			canvasTopLeftY, 
			SPRITE_IMAGE_WIDTH, 
			SPRITE_IMAGE_HEIGHT
		);

		if (!this.previousTopLeft 
				|| (this.previousTopLeft.x !== canvasTopLeftX || this.previousTopLeft.y !== canvasTopLeftY)){
					
			const { top, left } = prop.calcAbsTopLeft(canvasTopLeftX, canvasTopLeftY);
			this.avatarModel.top = top - AVATAR_NAME_FONT_SIZE;
			this.avatarModel.left = left;
		}


		this.previousTopLeft = {
			x: canvasTopLeftX,
			y: canvasTopLeftY
		};
	}

	override clear(prop: CanvasProps): void {
		// https://stackoverflow.com/questions/3543687/how-do-i-clear-text-from-the-canvas-element
		if (this.previousTopLeft) {
			prop.ctx.clearRect(
				this.previousTopLeft.x, 
				this.previousTopLeft.y, 
				SPRITE_IMAGE_WIDTH, 
				SPRITE_IMAGE_HEIGHT
			);
			
		}
	}
	
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	override onresize(prop: CanvasProps): void {
		this.previousTopLeft = undefined;
	}

	doesCollideWith(another: Avatar): boolean {
		if (this.myId === another.myId) {
			return false;
		}
		if (this.center.distance(another.center) > SPRITE_IMAGE_WIDTH * 2) {
			return false;
		}
		const thisForward = Avatar.Forwards.get(this.currentDirection);
		const anotherForward = Avatar.Forwards.get(another.currentDirection);
		if (!thisForward || !anotherForward) {
			return false;
		}
		const thisForwardPos = thisForward.transform(this.center);
		const anotherForwardPos = anotherForward.transform(another.center);

		return thisForwardPos.distance(anotherForwardPos) < this.center.distance(another.center);
	}

	onCheckCollision(isCollided: boolean) {
		this.avatarModel.talking = isCollided;
	}
}


class AvatarManager {
	
	_myAvatar: Avatar | undefined;
	peers: Map<string, Avatar>;
	onCollisionHandlers: Array<(peer: Avatar, collide: boolean) => void> = [];

	frameIndex: number;
	framesPerCollisionDetection: number;

	constructor(framesPerCollisionDetection: number) {
		this.peers = new Map();
		
		this.frameIndex = 0;
		this.framesPerCollisionDetection = framesPerCollisionDetection;
	}

	set myAvatar(myAvatar: Avatar) {
		this._myAvatar = myAvatar;
	}

	add(peerId: string, peer: Avatar) {
		this.peers.set(peerId, peer);
	}

	delete(peerId: string) {
		this.peers.delete(peerId);
	}

	has(peerId: string): boolean {
		return this.peers.has(peerId);
	}

	onresize(prop: CanvasProps): void {
		if (this._myAvatar) {
			this._myAvatar.onresize(prop);
		}
		for (const [,value] of this.peers) {
			value.onresize(prop);
		}
	}

	onCollision(f: (peer: Avatar, collide: boolean) => void) {
		this.onCollisionHandlers.push(f);
	}

	ifPresent(peerId: string, action: (a: Avatar) => void) {
		const p = this.peers.get(peerId);
		if (!p) {
			return;
		}
		action(p);
	}

	detectCollision() {
		if (this.frameIndex !== this.framesPerCollisionDetection) {
			this.frameIndex++;
			return;
		}
		this.frameIndex = 0;

		if (!this._myAvatar) {
			return;
		}
		for (const [,peer] of this.peers) {
			const collide = peer.doesCollideWith(this._myAvatar);
			this.onCollisionHandlers.forEach(f => f.call(this, peer, collide));
		}
	}

}

export {
	Avatar,
	AvatarModel,
	AvatarModelUtil,
	AvatarManager
};