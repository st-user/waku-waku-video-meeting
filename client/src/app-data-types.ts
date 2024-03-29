interface AppData {
	member: Member | undefined
}

interface Member {
	memberId: number,
    roomId: number,
    memberName: string
    secretToken: string,
	tokenToSend: string
	useStableMode: boolean
}

enum AppState {
	Init,
	Started
}

interface VideoWindow {
	readonly id: string,
	name: string
	srcObject: MediaStream | null,
	isDisplayed: boolean,
	cssHeight: number
}


interface VideoModel {
	videoWindow: VideoWindow,
	audio: HTMLAudioElement,
}

enum AvatarState {
	Playing = 'Playing',
	Leaving = 'Leaving'
}

interface AvatarModel {
	top: number,
	left: number,
	readonly id: string,
	readonly name: string,
	talking: boolean,
	state: AvatarState
}

interface MeetingRoomData {
	srcObject: MediaStream | null,
	myVideoCssHeight: number,
	message: string,
	videos: Array<VideoWindow>,
	state: AppState
	canvasCssWidth: number,
	canvasCssHeight: number,
	avatars: Array<AvatarModel>
}

interface MeetingRoomModelHandle {
	avatarModel: AvatarModel | undefined;
	videoModel: VideoModel | undefined;
}

interface MeetingRoomModelHandleHolder {
	putVideo(id: string, v: VideoModel): void,
	getVideo(id: string): VideoModel | undefined,
	putAvatar(id: string, av: AvatarModel): void,
	getAvatar(id: string): AvatarModel | undefined,
	mute(id: string): void,
	unmute(id: string): void,
	leave(id: string): void,
	play(id: string): void,
	delete(id: string): void,
	onDelete(f: (id: string) => void)
}

export {
	AppData,
	Member,
	MeetingRoomData,
	AppState,
	VideoWindow,
	VideoModel,
	AvatarState,
	AvatarModel,
	MeetingRoomModelHandle,
	MeetingRoomModelHandleHolder
};