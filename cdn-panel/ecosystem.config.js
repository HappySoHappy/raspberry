module.exports = {
  apps: [{
    name: "cdn",
    script: "server.js",
    exec_mode: "fork",
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production"
    }
  }]
}