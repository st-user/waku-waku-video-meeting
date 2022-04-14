
enum AvatarDirection {
	DOWN,
	UP,
	LEFT,
	RIGHT
}

enum MessageType {
	Opened,
	Joined,
	Hello,
	HelloResponse,
	Move,
	Stop,
	Bye
}

interface Message {
	msgType: MessageType
	id: string
}

interface HelloMessage extends Message {
	name: string
}

interface MoveMessage extends Message {
	direction: AvatarDirection,
	coord: {x: number, y: number};
}

interface HelloResponseMessage extends HelloMessage, MoveMessage {
}

export {
	AvatarDirection,
	MessageType,
	Message,
	HelloMessage,
	MoveMessage,
	HelloResponseMessage,
};