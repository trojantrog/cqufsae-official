// Lossless transport for the original geometry buffers.
// Each gzip chunk contains four byte planes; decoding restores every source bit.
export async function fetchModelBinary(input) {
  const sourceURL = new URL(input, document.baseURI);
  const manifestURL = new URL(sourceURL);
  manifestURL.pathname += '.pack.json';
  const controller = new AbortController();
  const signal = controller.signal;
  async function checkedFetch(url, consume) {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(url, {signal});
        if (!response.ok) throw new Error(`Geometry transfer ${response.status}`);
        // fetch resolves at the headers; retry body reads and decoding as well.
        return await consume(response);
      } catch (error) {
        if (signal.aborted || attempt >= 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }
  try {
    const manifest = await checkedFetch(manifestURL, response => response.json());
    if (manifest.version !== 1 || manifest.encoding !== 'gzip-byteplanes4' ||
        !Number.isSafeInteger(manifest.byteLength) || manifest.byteLength <= 0 ||
        manifest.byteLength > 1024 ** 3 || !Array.isArray(manifest.chunks)) {
      throw new Error('Geometry manifest format');
    }
    let end = 0;
    for (const chunk of manifest.chunks) {
      if (chunk.offset !== end || !Number.isSafeInteger(chunk.byteLength) ||
          chunk.byteLength <= 0 || chunk.byteLength % 4 ||
          !/^packed\/[a-z0-9.-]+\.dat$/.test(chunk.file)) throw new Error('Geometry chunk bounds');
      end += chunk.byteLength;
    }
    if (end !== manifest.byteLength) throw new Error('Geometry chunk length');
    const output = new Uint8Array(manifest.byteLength);
    let next = 0;
    async function worker() {
      while (next < manifest.chunks.length) {
        const chunk = manifest.chunks[next++];
        const planes = await checkedFetch(new URL(chunk.file, manifestURL), async response => {
          let decoded;
          if (typeof DecompressionStream === 'function') {
            decoded = new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
          } else {
            const {gunzipSync} = await import('./vendor/fflate.module.js');
            decoded = gunzipSync(new Uint8Array(await response.arrayBuffer()));
          }
          if (decoded.byteLength !== chunk.byteLength) throw new Error('Geometry chunk size');
          return decoded;
        });
        const count = planes.byteLength / 4;
        for (let plane = 0; plane < 4; plane++) {
          const start = plane * count;
          for (let i = 0, target = chunk.offset + plane; i < count; i++, target += 4) {
            output[target] = planes[start + i];
          }
        }
      }
    }
    await Promise.all(Array.from({length: Math.min(4, manifest.chunks.length)}, worker));
    return output.buffer;
  } catch (error) {
    controller.abort();
    throw error;
  }
}
