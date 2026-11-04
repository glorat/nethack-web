// Firebase Auth's sign-in helper pages, served from this site so browsers that block third-party storage still let sign-in finish.
export const onRequest = ({ request }) => {
  const url = new URL(request.url);
  url.hostname = "nethack-web-server.firebaseapp.com";
  return fetch(new Request(url, request));
};
