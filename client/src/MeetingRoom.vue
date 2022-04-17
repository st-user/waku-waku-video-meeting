<template>
		<!-- Canvas for avatar animations -->
		<section>
			<div class="avatar-container">
				<canvas ref="mainCanvas" class="main-scene"
					:style="{ width: String(canvasCssWidth) + 'px', height: String(canvasCssHeight) + 'px' }" width="800"
					height="400"></canvas>
				<div v-for="am in avatars" :key="am.id" class="avatar-name-tooltip"
					:style="{ top: String(am.top) + 'px', left: String(am.left) + 'px' }">
					{{ am.name }}
				</div>
			</div>
		</section>
		<section class="video-container">
			<div v-if="isStarted" class="m-3">
				<div class="publisher">My Video</div>
				<video :src-object.prop.camel="srcObject" :style="{ height: String(myVideoCssHeight) + 'px' }" autoplay></video>
			</div>
			<div v-if="isStarted" class="peer-videos-container m-3">
				<template v-for="video in videos" :key="video.id">
					<div :style="{ display: video.isDisplayed ? 'block' : 'none' }" class="m-1">
						<div class="subscriber">{{ video.name }}</div>
						<video :src-object.prop.camel="video.srcObject" autoplay :style="{ height: String(video.cssHeight) + 'px' }"></video>
					</div>
				</template>
			</div>
		</section>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import {
	AppState,
	AvatarModel,
	MeetingRoomData,
	MeetingRoomModelHandle,
	MeetingRoomModelHandleHolder,
	VideoModel
} from './app-data-types';

import { ConnectionHandler } from './rtc/rtc';
import { startAvatarScene, initializeResizeEvent } from './avatar/mounter';

class MeetingRoomModelHandleHolderImpl implements MeetingRoomModelHandleHolder {

	private readonly handles: Map<string, MeetingRoomModelHandle>;
	private readonly onDeleteHandlers: Array<(id: string) => void> = [];

	constructor() {
		this.handles = new Map();
	}

	getVideo(id: string): VideoModel | undefined {
		const handle = this.handles.get(id);
		if (!handle) {
			return undefined;
		}
		return handle.videoModel;
	}

	getAvatar(id: string): AvatarModel | undefined {
		const handle = this.handles.get(id);
		if (!handle) {
			return undefined;
		}
		return handle.avatarModel;
	}

	putVideo(id: string, v: VideoModel): void {
		let handle = this.handles.get(id);
		if (!handle) {
			handle = {} as MeetingRoomModelHandle;
			this.handles.set(id, handle);
		}
		handle.videoModel = v;
	}

	putAvatar(id: string, av: AvatarModel): void {
		let handle = this.handles.get(id);
		if (!handle) {
			handle = {} as MeetingRoomModelHandle;
			this.handles.set(id, handle);
		}
		handle.avatarModel = av;
	}

	mute(id: string): void {
		this.changeMute(id, true);
	}

	unmute(id: string): void {
		this.changeMute(id, false);
	}

	private changeMute(id: string, muted: boolean): void {
		const handle = this.handles.get(id);
		if (!handle) {
			return;
		}
		if (handle.videoModel) {
			handle.videoModel.videoWindow.isDisplayed = !muted;
			handle.videoModel.audio.muted = muted;
		}
	}

	delete(id: string): void {
		this.onDeleteHandlers.forEach(f => f.call(this, id));
	}

	onDelete(f: (id: string) => void) {
		this.onDeleteHandlers.push(f);
	}
}


const App = defineComponent({
	setup() {
		// https://logaretm.com/blog/vue-composition-api-non-reactive-objects/
		const connectionHandler = new ConnectionHandler();
		const modelHandleHolder: MeetingRoomModelHandleHolder = new MeetingRoomModelHandleHolderImpl();
		return {
			connectionHandler,
			modelHandleHolder
		};
	},
	data(): MeetingRoomData {
		return {
			srcObject: null,
			message: '',
			videos: [],
			myVideoCssHeight: window.innerHeight * 0.25,
			state: AppState.Init,
			canvasCssWidth: 600,
			canvasCssHeight: 400,
			avatars: []
		};
	},
	methods: {
		start(): void {
			if (!this.$appData.member) {
				throw Error('Member is not set yet.');
			}
			this.state = AppState.Started;
			this.connectionHandler.init(
				this,
				this.$appData.member,
				this.modelHandleHolder,
				(trackId: string, dc: RTCDataChannel) => {
					startAvatarScene(
						trackId,
						dc,
						this,
						this.$appData,
						this.$refs['mainCanvas'] as HTMLCanvasElement,
						this.modelHandleHolder
					);
				}
			);
		},
	},
	mounted() {
		initializeResizeEvent(this, this.$refs['mainCanvas'] as HTMLCanvasElement);
		setTimeout(() => {
			this.start();
		}, 300);
	},
	computed: {
		isStarted(): boolean {
			const data = this as MeetingRoomData;
			return data.state === AppState.Started;
		},
	}
});
export default App;
</script>

<style scoped>

.avatar-container {
	position: relative;
	width: 100%;
}

.avatar-name-tooltip {
	position: absolute;
	z-index: 100;
	height: 24px;
	font-family: Comic Sans MS;
	color: rgba(33, 31, 31, 0.741);
	text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.943);
}

.main-scene {
	border: 1px solid gray;
	margin: auto;
	display: block;
	background: linear-gradient(-45deg, #464549, #195639, #146380, #0c5b48);
	background-size: 400% 400%;
	animation: main-scene-gradient 45s ease infinite;
}

@keyframes main-scene-gradient {
	0% {
		background-position: 0% 50%;
	}
	50% {
		background-position: 100% 50%;
	}
	100% {
		background-position: 0% 50%;
	}
}

.video-container {
	display: flex;
}

.publisher {
	color: rgb(14, 7, 44);
	width: 100%;
	text-align: center;
}

.peer-videos-container {
	display: flex;
}

.subscriber {
	color: rgb(2, 26, 13);
	width: 100%;
	text-align: center;
}

.message-input {
	width: 360px;
}
</style>