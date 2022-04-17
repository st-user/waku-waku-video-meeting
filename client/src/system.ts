function backToHomeWithDelay(message: string) {
	setTimeout(() => {
		alert(message);
		window.location.replace('/');
	}, 300);
}

function handleUnrecoverableError() {
	backToHomeWithDelay('Sorry, unrecoverable error occurs so I\'ll back to home. Please retry later.');
}

export {
	backToHomeWithDelay,
	handleUnrecoverableError
};