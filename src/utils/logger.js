function info(message) {
  console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
}

function error(message, err) {
  console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
  if (err) {
    console.error(err);
  }
}

module.exports = { info, error };
