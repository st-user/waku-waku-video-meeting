<template>
	<section class="login-room card">
		<div v-if="!!apiErr" class="api-error has-text-danger">
			{{  apiErr }}
		</div>
		<div class="card-content">
			<div class="top-message title is-5">Let's join a room!</div>
			<div class="mb-3">
				<p class="input-label">Room key:</p>
				<input
					type="text"
					v-model="roomKey"
					@keyup="inputRoomKey"
					class="input"
					:class="{ 'is-danger': !!roomKeyErr }"/>

				<div v-if="!!roomKeyErr" class="has-text-danger">
					{{ roomKeyErr }}
				</div>
			</div>
			<div class="mb-3">
				<p class="input-label">Name:</p>
				<input
					type="text"
					v-model="memberName"
					@keyup="inputMemberName"
					class="input"
					:class="{ 'is-danger': !!memberNameErr }"/>
				<div v-if="!!memberNameErr" class="has-text-danger">
					{{ memberNameErr }}
				</div>
			</div>
			<div class="mb-3">
				<label>
				<input type="checkbox" v-model="useStableMode"/>
				use stable mode (recommended in enterprise intra net)
				</label>
			</div>
			<div class="command-button mb-5">
				<button
					type="button"
					@click="join"
					:disabled="!canJoin"
					class="button is-info">join</button>
			</div>
			<div>
				<div class="mb-1">Do you want to create a new room?</div>
				<div v-if="!isAuthenticated" class="mb-3">
					<button
						type="button"
						@click="authenticate"
						class="button is-info">authenticate</button>
				</div>
				<div v-if="isAuthenticated">
					<div class="mb-3">
						<p class="input-label">Room name:</p>
						<input
							type="text"
							v-model="roomName" 
							@keyup="inputRoomName"
							class="input"
							:class="{ 'is-danger': !!roomNameErr }"/>
						<div v-if="!!roomNameErr" class="has-text-danger">
							{{ roomNameErr }}
						</div>
					</div>
					<div class="command-button">
						<button
							type="button"
							@click="createRoom"
							:disabled="!canCreateRoom"
							class="button is-info">create</button>
						<button
							type="button"
							@click="logout"
							class="button is-warning ml-3">logout</button>

					</div>
				</div>
			</div>

		</div>
	</section>
</template>

<script lang="ts">
import { defineComponent, Ref } from 'vue';
import { useAuth0 } from '@auth0/auth0-vue';
import { User } from '@auth0/auth0-spa-js';

interface DataType {
	roomKey: string,
	roomKeyErr: string | undefined,
	memberName: string,
	memberNameErr: string | undefined
	useStableMode: boolean,
	auth0User: User,
	roomName: string,
	roomNameErr: string | undefined,
	isAuthenticated: Ref<boolean>,
	apiErr: string | undefined
}

interface RoomResponse {
	room_id: number,
	room_name: string,
	secret_token: string
}

interface MemberResponse {
	member_id: number,
    room_id: number,
    member_name: string
    secret_token: string,
	token_to_send: string,
}

interface ErrorResponse {
	message: string
}

const NAME_MAX_CHAR_COUNT = 30;

const App = defineComponent({
	setup() {
		const { loginWithRedirect, logout } = useAuth0();

		return {
			authenticate: () => {
				loginWithRedirect();
			},
			logout: () => {
				logout({
					returnTo: window.location.origin
				});
			}
		};
	},
	data(): DataType {
		return {
			roomKey: '',
			roomKeyErr: undefined,
			memberName: '',
			memberNameErr: undefined,
			useStableMode: false,
			auth0User: this.$auth0.user,
			isAuthenticated: this.$auth0.isAuthenticated,
			roomName: '',
			roomNameErr: undefined,
			apiErr: undefined
		};
	},
	methods: {
		inputRoomKey(): void {
			if (this.roomKey.length === 0) {
				this.roomKeyErr = 'Room key is empty.';
			} else {
				this.roomKeyErr = undefined;
			}
		},
		inputMemberName(): void {
			this.memberNameErr = checkTextLength(
				this.memberName,
				NAME_MAX_CHAR_COUNT,
				'Name'
			);
		},
		join(): void {
			join(this.roomKey, this.memberName).then(result => {
				if (result.err) {
					this.apiErr = result.err;
					return;
				}
				if (result.member) {
					this.$appData.member = {
						memberId: result.member.member_id,
						roomId: result.member.room_id,
						memberName: result.member.member_name,
						secretToken: result.member.secret_token,
						tokenToSend: result.member.token_to_send,
						useStableMode: this.useStableMode,
					};
				}
			});
		},
		createRoom(): void {
			this.$auth0.getAccessTokenSilently().then(token => {
				createRoom(token, this.roomName).then(result=> {
					if (result.err) {
						this.apiErr = result.err;
					}
					if (result.room) {
						this.roomKey = `${result.room.room_id}:${result.room.secret_token}`;
					}
					this.inputRoomKey();
				});
			});
		},
		inputRoomName(): void {
			this.roomNameErr = checkTextLength(
				this.roomName,
				NAME_MAX_CHAR_COUNT,
				'Room name'
			);
		}
	},
	computed: {
		canJoin(): boolean {
			return this.roomKey.length > 0
				&& this.memberName.length > 0
				&& !this.roomKeyErr
				&& !this.memberNameErr;
		},
		canCreateRoom(): boolean {
			return this.roomName.length > 0 && !this.roomNameErr;
		}
	}
});

function checkTextLength(
	text: string,
	max: number,
	name: string) {
	if (text.length === 0) {
		return `${name} is empty.`;
	} else if ([...text].length > max) {
		// https://medium.com/@tanishiking/count-the-number-of-unicode-code-points-in-javascript-on-cross-browser-62c32b8d919c
		return `${name} must be no more than ${max} characters.`;
	}
	return undefined;
}

async function createRoom(token: string, roomName: string): Promise<{
	room: RoomResponse | undefined,
	err: string | undefined
}> {

	return await fetch('/auth/room', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`
		},
		body: JSON.stringify({
			room_name: roomName
		})
	}).then(async res => {
		if (!res.ok) {
			const errMsg = await res.json() as ErrorResponse;
			if (!errMsg.message) {
				throw new Error('Unexpected response');
			}
			return {
				room :undefined,
				err: errMsg.message
			};
		}
		return {
			room: (await res.json() as RoomResponse),
			err: undefined
		};
	}).catch(() => {
		return {
			room: undefined,
			err: 'The service is currently unavailable. Please retry later.'
		};
	});
}


async function join(roomKey: string, memberName: string): Promise<{
	member: MemberResponse | undefined,
	err: string | undefined
}> {

	const roomTokens = roomKey.split(':');
	const room_id = parseInt(roomTokens[0] as string, 10);
	const room_secret_token = roomTokens[1];
	if (isNaN(room_id) || !room_secret_token) {
		return {
			member: undefined,
			err: 'The format of the room key is invalid.'
		};
	}

	return await fetch('/auth/member', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			room_id,
			room_secret_token,
			member_name: memberName
		})
	}).then(async res => {
		if (!res.ok) {
			const errMsg = await res.json() as ErrorResponse;
			if (!errMsg.message) {
				throw new Error('Unexpected response');
			}
			return {
				member :undefined,
				err: errMsg.message
			};
		}
		return {
			member: (await res.json() as MemberResponse),
			err: undefined
		};
	}).catch(() => {
		return {
			member: undefined,
			err: 'The service is currently unavailable. Please retry later.'
		};
	});
}

export default App;
</script>

<style scoped>
.login-room {
	max-width: 560px;
	margin: auto;
}

.top-message {
	width: 100%;
	text-align: center;
	line-height: 2.5;
}

.api-error {
	width: 100%;
	text-align: center;
}

.input-label {
	font-weight: bold;
}

.command-button {
	width: 100%;
	text-align: right;
}

</style>
