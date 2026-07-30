// Submits the contact form to /api/contact without a page reload, reproducing
// the inline confirmation the WPForms version used to show.
//
// The form still posts normally if this script never runs, so a failure here
// costs the visitor a page reload — not their message.
(function () {
  'use strict';

  var form = document.getElementById('wpforms-form-21642');
  if (!form || !window.fetch) return;

  var button = form.querySelector('button[type="submit"]');
  var spinner = form.querySelector('.wpforms-submit-spinner');
  var busyText = button && button.getAttribute('data-alt-text');
  var idleText = button ? button.textContent : '';

  function setBusy(busy) {
    if (!button) return;
    button.disabled = busy;
    if (busyText) button.textContent = busy ? busyText : idleText;
    if (spinner) spinner.style.display = busy ? '' : 'none';
  }

  function clearNotice() {
    var old = form.parentNode.querySelector('.ef-form-notice');
    if (old) old.parentNode.removeChild(old);
  }

  function notice(kind, text) {
    clearNotice();
    var el = document.createElement('div');
    el.className = 'ef-form-notice wpforms-confirmation-container-full';
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.style.cssText =
      'margin:0 0 24px;padding:15px;border-radius:6px;' +
      (kind === 'error'
        ? 'background:#fdeceb;border-left:3px solid #d63638;color:#8a1f1d'
        : 'background:#f1f7f1;border-left:3px solid #46803f;color:#2c5228');
    el.textContent = text;
    form.parentNode.insertBefore(el, form);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', function (event) {
    // Let the browser's own required/type checks run first.
    if (typeof form.checkValidity === 'function' && !form.checkValidity()) return;

    event.preventDefault();
    clearNotice();
    setBusy(true);

    var payload = {
      name: value('wpforms-21642-field_1'),
      email: value('wpforms-21642-field_2'),
      message: value('wpforms-21642-field_3'),
      extra: value('wpforms-21642-field_4'),
      website: value('ef-website'),
    };

    fetch(form.getAttribute('action'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (result.ok && result.body.ok) {
          form.style.display = 'none';
          notice('success', 'Thank you for your message');
          return;
        }
        var errs = result.body.errors;
        notice(
          'error',
          errs
            ? Object.keys(errs).map(function (k) { return errs[k]; }).join(' ')
            : result.body.error || 'Δεν στάλθηκε το μήνυμα. Δοκίμασε ξανά.',
        );
        setBusy(false);
      })
      .catch(function () {
        notice('error', 'Δεν υπάρχει σύνδεση. Δοκίμασε ξανά σε λίγο.');
        setBusy(false);
      });
  });

  function value(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }
})();
