# exploringfox.gr

Static site for **exploringfox.gr** — day and two-day sailing cruises in Greece.

## What this is

A static snapshot of the original WordPress site (theme `ewebot` + Elementor),
captured from the live server and cleaned up so it can be served without PHP,
MySQL, or a VPS.

Hosted as a **Cloudflare Worker with static assets** (Worker name:
`explorinfox`). Almost everything is served straight from `public/`; the Worker
in `src/index.js` exists only to answer the one API call the page still makes —
see *The slider's REST calls* below. Nothing is compiled.

## Deploying

Cloudflare builds from `main` automatically. The deploy command is
`npx wrangler deploy`, which reads `wrangler.jsonc`; the dashboard build
settings need no build command and no framework preset.

To deploy by hand:

```sh
npx wrangler deploy      # needs Node 22+
```

## The slider's REST calls

Slider Revolution is configured to lazy-load. The homepage ships only the first
slide inline and fetches each subsequent one at transition time from

```
/wp-json/sliderrevolution/sliders/7?engine=7&slideid=<id>
```

Without PHP those calls 404, the transition throws, and the slider sits on
slide 1 while its progress ring keeps looping — with nothing obviously broken
on screen.

Since the site no longer changes, all seven responses were captured from the
original server into `public/_slider/` and the Worker replays them. If the
slider is ever re-edited, those files must be recaptured.

`run_worker_first` is set for `/wp-json/*` in `wrangler.jsonc`; without it asset
routing answers with the 404 page before the Worker runs.

## Layout

```
wrangler.jsonc        Worker + static-asset configuration
src/index.js          serves the captured slider responses; everything else
                      falls through to the assets
public/               everything served to visitors
  _slider/              captured Slider Revolution REST responses
  index.html            home
  about-us/             one directory per page, each with index.html
  services/
  events/
  photogallery/
  contact-us/
  faq/
  terms_of_use/
  privacy_policy/
  404.html
  wp-content/           theme, plugin and Elementor assets + uploaded media
  wp-includes/          WordPress core JS still referenced by the theme
  robots.txt
  sitemap.xml
```

## How it was produced

1. `wget --mirror` of the live site, which captures the *rendered* HTML rather
   than the Elementor JSON stored in the database.
2. Query strings stripped from asset filenames (`jquery.min.js?ver=3.7.1` →
   `jquery.min.js`) and from the references pointing at them.
3. Absolute `https://exploringfox.gr/…` URLs rewritten to root-relative so the
   site is self-contained on any host.
4. `canonical`, `og:*`, `twitter:*` and the JSON-LD block deliberately **kept
   absolute** — they describe where the page lives, not where its assets load
   from.
5. WordPress head cruft removed: RSD/EditURI, `wp-json` discovery links,
   `generator` meta, emoji detection script.
6. Only media actually referenced by the pages was kept — 355 MB of WordPress
   thumbnails reduced to 34 MB.

The one hand-written page is `public/404.html`, which the original site had no
static equivalent of.

## Known issues carried over from the original site

These images are referenced but return 404 on the original server too, and are
absent from the WordPress backup. They were broken before the migration:

- `/wp-content/uploads/2021/03/exploringfoxlogo2.png` — on `faq/`
- `/wp-content/uploads/2025/06/49681134_9281770.png` — on the home page
- `/wp-content/uploads/2025/06/49681147_9281761.png` — on the home page
- `/wp-content/uploads/2025/06/49681148_9281763.png` — on the home page

## Not working yet

The contact form is still the original WPForms markup and posts to
`/contact-us/`, which no longer has PHP behind it. It needs to be rewired to a
Cloudflare Pages Function backed by [Resend](https://resend.com).

Original form behaviour, for reference when reimplementing:

| | |
| --- | --- |
| Recipient | `info@exploringfox.gr` |
| Subject | Μήνυμα από τη Φόρμα Επικοινωνίας |
| Sender name | Contact Form exploringfox.gr |
| Reply-To | the visitor's email field |
| On success | shows "Thank you for your message" |

Fields: name, email, message (plus one extra text field the original form
labelled inconsistently).
