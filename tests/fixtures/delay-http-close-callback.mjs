import { Server } from 'node:http';

// Keep the shutdown promise pending long enough for the public-command test
// to deliver a second signal after observing SHUTDOWN_START. This affects
// only processes launched with this test fixture via NODE_OPTIONS.
const originalClose = Server.prototype.close;
Server.prototype.close = function closeWithDelayedCallback(callback) {
  if (typeof callback !== 'function') {
    return originalClose.call(this, callback);
  }
  return originalClose.call(this, (error) => {
    setTimeout(() => callback(error), 400);
  });
};
