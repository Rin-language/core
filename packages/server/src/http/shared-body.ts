/**
 * A response body that reads straight from bytes held once for every request.
 * Handing the bytes themselves to a response makes a copy per request, so a
 * few thousand clients that read slowly would hold gigabytes of copies; a
 * stream of the shared bytes holds none.
 */
export function sharedBody(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
