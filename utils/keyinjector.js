function injectKey(axios) {
	axios.interceptors.request.use(function (config) {
		if ((process.env.NODE_ENV === undefined) || (process.env.NODE_ENV != 'prod')) {
			config.headers['X-APP-ID'] = 'f9061f407b9ee826bcf41d7a82c68999';
		} else {
			config.headers['X-APP-ID'] = 'f9061f407b9ee826bcf41d7a82c68888';
		}
		return config;
	}, function (error) {
		return Promise.reject(error);
	});
}

module.exports = {
	injectKey
};