// next.config.js
module.exports = {
    exportPathMap: function(defaultPathMap) {
        return {
            "/": { page: "/" },
            "/debug": { page: "/debug" },
            "/admin": { page: "/admin" }
        };
    }
};
