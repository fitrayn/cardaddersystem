module.exports = {
  apps: [
    {
      name: 'facebook-card-adder-server',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    },
    {
      name: 'facebook-card-adder-worker',
      script: 'dist/worker.js',
      instances: 2, // Run 2 worker instances for better throughput
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
}; 