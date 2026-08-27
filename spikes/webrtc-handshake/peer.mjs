// Plain browser JS, no bundler, no path aliases — this file is loaded
// directly into a page via <script type="module">. It is the same shape as
// the `Transport` port in src/application/ports/transport.ts, reimplemented
// here without TypeScript so it needs no build step to run inside a real
// page. If the spike holds up, this is what src/adapters/transport/
// webRtcTransport.ts becomes, properly tested.

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function waitForIceGatheringComplete(connection, timeoutMs = 1500) {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      connection.removeEventListener('icegatheringstatechange', check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (connection.iceGatheringState === 'complete') finish();
    };
    connection.addEventListener('icegatheringstatechange', check);
    // No STUN response (blocked UDP, a hostile network) must not hang the
    // handshake forever. Whatever candidates exist at the deadline are what
    // gets sent — on a shared local network that can still be enough, since
    // the host candidates gathered first need no STUN round trip at all.
    const timer = setTimeout(finish, timeoutMs);
  });
}

function transportFromChannel(connection, channel) {
  let state = 'connecting';
  const handlers = new Set();
  const received = [];

  channel.addEventListener('open', () => (state = 'connected'));
  channel.addEventListener('close', () => (state = 'closed'));
  channel.addEventListener('error', () => (state = 'closed'));
  channel.addEventListener('message', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    received.push(payload);
    for (const handler of handlers) handler(payload);
  });

  return {
    get state() {
      return state;
    },
    get received() {
      return received;
    },
    send(payload) {
      channel.send(JSON.stringify(payload));
    },
    onReceive(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      channel.close();
      connection.close();
    }
  };
}

export function offerConnection() {
  const connection = new RTCPeerConnection(RTC_CONFIG);
  const channel = connection.createDataChannel('game-events', { ordered: true });
  const transport = transportFromChannel(connection, channel);

  const offer = (async () => {
    const description = await connection.createOffer();
    await connection.setLocalDescription(description);
    await waitForIceGatheringComplete(connection);
    return connection.localDescription.sdp;
  })();

  return {
    offer,
    async accept(answer) {
      await connection.setRemoteDescription({ type: 'answer', sdp: answer });
    },
    transport
  };
}

export function answerConnection(offer) {
  const connection = new RTCPeerConnection(RTC_CONFIG);

  const transport = new Promise((resolve) => {
    connection.addEventListener('datachannel', (event) => {
      resolve(transportFromChannel(connection, event.channel));
    });
  });

  const answer = (async () => {
    await connection.setRemoteDescription({ type: 'offer', sdp: offer });
    const description = await connection.createAnswer();
    await connection.setLocalDescription(description);
    await waitForIceGatheringComplete(connection);
    return connection.localDescription.sdp;
  })();

  return { answer, transport };
}

window.__peer = { offerConnection, answerConnection };
window.__peerReady = true;
