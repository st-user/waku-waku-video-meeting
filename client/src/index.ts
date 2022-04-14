import { createApp } from 'vue';
import App from './App.vue';
import { AppData } from './app-data-types';

import  appDataPlugin from './plugins/app-data';
import { createAuth0 } from '@auth0/auth0-vue';

declare module '@vue/runtime-core' {
	interface ComponentCustomProperties {
		$appData: AppData
	}
}

interface ApiInfo {
	domain: string,
	client_id: string,
	audience: string
}

fetch('/auth/api-info')
	.then(res => res.json())
	.then(({ domain, client_id, audience }: ApiInfo) => {
		createApp(App)
			.use(appDataPlugin)
			.use(createAuth0({
				domain,
				client_id,
				redirect_uri: window.location.origin,
				audience
			}))
			.mount('#app');
	});