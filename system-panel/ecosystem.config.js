module.exports = {
  apps: [{
    name: "system",
    script: "server.js",
    exec_mode: "fork",
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production"
    }
  }]
}