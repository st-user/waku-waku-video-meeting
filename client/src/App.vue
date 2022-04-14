<template>
	<header class="header mb-3">
		<h1 class="title is-1">Waku-Waku Video Meeting</h1>
	</header>
	<div v-if="!$appData.member">
		<LoginRoom/>
	</div>
	<div v-if="!!$appData.member" class="meeting-room">
		<MeetingRoom/>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import LoginRoom from './LoginRoom.vue';
import MeetingRoom from './MeetingRoom.vue';

const App = defineComponent({
	components: {
		LoginRoom,
		MeetingRoom
	}
});
export default App;
</script>

<style scoped>
.header {
	width: 100%;
	font-family: Comic Sans MS;
}
.header > h1 {
	margin: auto;
	max-width: 648px;
}

</style>