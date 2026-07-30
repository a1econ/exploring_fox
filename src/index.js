// Slider Revolution is configured to lazy-load: the page ships only the first
// slide inline and fetches each subsequent one from the WordPress REST API at
// transition time. With no PHP behind the site those calls 404, the transition
// throws, and the slider sits on slide 1 while its progress ring keeps looping.
//
// The responses are static for a site that no longer changes, so they were
// captured from the original server into public/_slider/ and are replayed here.
// Everything else falls through to the static assets.

import { handleContact } from './contact.js';

const SLIDER_ENDPOINT = /^\/wp-json\/sliderrevolution\/sliders\/(\d+)\/?$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact') {
      return handleContact(request, env);
    }

    const match = url.pathname.match(SLIDER_ENDPOINT);

    if (match) {
      const sliderId = match[1];
      const slideId = url.searchParams.get('slideid');
      // Without a slideid the engine is asking for the whole slider object.
      const name = slideId ? `${sliderId}-${slideId}` : sliderId;

      const canned = await env.ASSETS.fetch(
        new URL(`/_slider/${encodeURIComponent(name)}.json`, url.origin),
      );

      if (canned.ok) {
        return new Response(canned.body, {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'public, max-age=3600',
          },
        });
      }

      return Response.json(
        { success: false, message: `No captured response for slider ${sliderId} slide ${slideId ?? '(none)'}` },
        { status: 404 },
      );
    }

    return env.ASSETS.fetch(request);
  },
};
