module.exports = {
  apps: [
    {
      name: "quinn-api",
      script: "apps/api/dist/index.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: "4000",
      },
      env_file: ".env",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "1G",
      error_file: "logs/quinn-error.log",
      out_file: "logs/quinn-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};

