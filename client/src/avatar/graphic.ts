class CanvasProps {

	private readonly _ctx: CanvasRenderingContext2D;
	private readonly _width: number;
	private readonly _height: number;
	private readonly _cssWidth: number;
	private readonly _cssHeight: number;
	private readonly _rect: DOMRect;

	constructor(canvas: HTMLCanvasElement) {
		this._ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
		this._width = canvas.width;
		this._height = canvas.height;
		const { cssWidth, cssHeight } = this.calcCssSize();
		this._cssWidth = cssWidth;
		this._cssHeight = cssHeight;
		this._rect = canvas.getBoundingClientRect();
	}

	private calcCssSize(): { cssWidth: number, cssHeight: number } {
		const windowWidth = window.outerWidth * 0.85;
		const windowHeight = window.outerHeight * 0.5;
		const windowAspectRatio = windowWidth / windowHeight;
		const canvasAspectRatio = this._width / this._height;

		let cssWidth = windowWidth;
		let cssHeight = windowHeight;
		if (windowAspectRatio < canvasAspectRatio) {
			cssHeight = cssWidth / canvasAspectRatio;
		} else {
			cssWidth = cssHeight * canvasAspectRatio;
		}

		return { cssWidth, cssHeight };
	}

	get ctx() {
		return this._ctx;
	}

	get width() {
		return this._width;
	}

	get height() {
		return this._height;
	}

	get cssWidth() {
		return this._cssWidth;
	}

	get cssHeight() {
		return this._cssHeight;
	}

	calcAbsTopLeft(canvasX: number, canvasY: number): { top: number, left: number } {
		const widthRatio = this._cssWidth / this._width;
		const heightRatio = this._cssHeight / this._height;
		const canvasTop = 0;
		const canvasLeft = this._rect.left + window.scrollX;

		return {
			top: canvasY * heightRatio + canvasTop,
			left: canvasX * widthRatio + canvasLeft
		};
	}
}


interface SceneObject {
	getId(): number;
	render(prop: CanvasProps): void;
	clear(prop: CanvasProps): void;
	onresize(prop: CanvasProps): void;
}

class BaseSceneObject implements SceneObject {

	private static idCounter = 0;
	private readonly id: number;

	constructor() {
		this.id = BaseSceneObject.idCounter;
		BaseSceneObject.idCounter++;
	}

	getId(): number {
		return this.id;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	render(prop: CanvasProps): void {
		return;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	clear(prop: CanvasProps): void {
		return;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	onresize(prop: CanvasProps): void {
		return;
	}
}

class Vector {

	private _x: number;
	private _y: number;

	constructor(x: number, y: number) {
		this._x = x;
		this._y = y;
	}

	get x() {
		return this._x;
	}

	get y() {
		return this._y;
	}

	set(x: number, y: number): void {
		this._x = x;
		this._y = y;
	}

	add(x: number, y: number): void {
		this._x += x;
		this._y += y;
	}

	toCanvasXY(canvasWidth: number, canvasHeight: number): {x: number, y: number} {
		return {
			x: (canvasWidth / 2) + this.x,
			y: (canvasHeight / 2) - this.y
		};
	}

	unit(): Vector {
		const length = this.length;
		if (length === 0) {
			return new Vector(0, 0);
		}
		return new Vector(
			this.x / length,
			this.y / length
		);
	}

	get length() {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}

	transform(d: Vector): Vector {
		return new Vector(this.x + d.x, this.y + d.y);
	}

	dot(another: Vector): number {
		return this.x * another.x + this.y * another.y;
	}

	cross(another: Vector): number {
		return this.x * another.y - this.y * another.x;
	}

	distance(another: Vector): number {
		const dx = this.x - another.x;
		const dy = this.y - another.y;
		return Math.sqrt(dx * dx + dy * dy);
	}
}


class Scene {

	private readonly _canvas: HTMLCanvasElement;
	private readonly objects: Map<number, SceneObject>;

	constructor(canvas: HTMLCanvasElement) {
		this._canvas = canvas;
		this.objects = new Map();
	}

	get canvas() {
		return this._canvas;
	}

	add(object: SceneObject): void {

		if (this.objects.has(object.getId())) {
			throw new Error(`Duplicate id = ${object.getId()}`);
		}

		this.objects.set(object.getId(), object);
	}

	render() {
		const prop = new CanvasProps(this._canvas);
		for (const [, value] of this.objects.entries()) {
			value.render(prop);
		} 
	}

	remove(object: SceneObject): void {
		const prop = new CanvasProps(this._canvas);
		object.clear(prop);
		this.objects.delete(object.getId());
	}

}

export {
	Scene,
	CanvasProps,
	SceneObject,
	Vector,
	BaseSceneObject
};