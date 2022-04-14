import { Plugin, reactive } from 'vue';
import { AppData } from '../app-data-types';

const appData: AppData = reactive({
	member: undefined
});


const plugin: Plugin = {
	install(app) {
		app.config.globalProperties['$appData'] = appData;

	}
};

export default plugin;
