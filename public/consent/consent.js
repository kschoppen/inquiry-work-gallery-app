/**
 * The consent page. No sign-in: the long link from the email is the key, and it shows one person's own words.
 * The speaker can fix the wording, tick "I agree" and type their name, or say no. One answer per link.
 */
(function () {
  var page = document.getElementById('page');
  var token = new URLSearchParams(location.search).get('t') || '';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k]; else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]); else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function show(nodes) {
    while (page.children.length > 1) page.removeChild(page.lastChild); // keep the "inquirED" line
    nodes.forEach(function (n) { page.appendChild(n); });
  }
  function call(body) {
    var request = body
      ? fetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      : fetch('/api/consent?t=' + encodeURIComponent(token));
    return request.then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again in a minute.');
        return data;
      });
    });
  }
  var foot = function () { return el('p', { class: 'small foot', text: "Changed your mind later? Reply to the email from inquirED and we'll take it down." }); };
  function done(title, text) {
    show([el('h1', { text: 'May we share what you said?' }), el('div', { class: 'panel' }, [el('p', { text: title, style: 'font-weight: 700' }), el('p', { text: text })]), foot()]);
  }
  function closed(view) {
    if (view.state === 'signed') return done('Thank you. You are all set.', 'This form has been signed. We emailed a copy of what was signed, with the date and time.');
    if (view.state === 'declined') return done("Understood. We won't share it.", 'This form was answered with "No, don\'t share". Nothing you said will be used.');
    done('This form is closed.', 'Ask ' + view.ism + ' for a new link if you still want to answer.');
  }

  function form(view) {
    var quote = el('textarea', { id: 'c-quote', rows: '6' });
    quote.value = view.quote;
    var agree = el('input', { type: 'checkbox', id: 'c-agree' });
    var name = el('input', { type: 'text', id: 'c-sign', autocomplete: 'name' });
    var problem = el('p', { class: 'error', role: 'alert', hidden: '' });
    var sign = el('button', { type: 'button', text: 'Sign and send' });
    var no = el('button', { type: 'button', class: 'quiet', text: "No, don't share" });
    function fail(message) { problem.textContent = message; problem.hidden = false; sign.disabled = no.disabled = false; }
    function send(body, after) {
      problem.hidden = true; sign.disabled = no.disabled = true;
      call(body).then(after).catch(function (e) { fail(e.message); });
    }
    sign.addEventListener('click', function () {
      if (!quote.value.trim()) return fail('Your words are empty. Add them back, or choose "No, don\'t share".');
      if (!agree.checked) return fail('Tick "I agree" to sign.');
      if (!name.value.trim()) return fail('Type your full name to sign.');
      send({ t: token, action: 'sign', quote: quote.value, agree: true, signedName: name.value }, function (r) {
        done('Thank you. You are all set.', r.copySent ? 'We emailed you a copy of what you signed, with the date and time.' : 'Your answer is saved with the date and time.');
      });
    });
    no.addEventListener('click', function () {
      send({ t: token, action: 'decline' }, function () { done("Understood. We won't share it.", 'We let ' + view.ism + ' know. Nothing you said will be used.'); });
    });
    show([
      el('h1', { text: 'May we share what you said?' }),
      el('p', { text: 'Check the words below, change anything that is off, then sign. No sign-in needed.' }),
      el('div', { class: 'field' }, [el('label', { class: 'name', for: 'c-quote', text: 'Your words' }), quote,
        el('span', { class: 'small', text: 'Shown with: ' + [view.name, view.role, view.district].filter(Boolean).join(', ') })]),
      el('div', { class: 'panel', role: 'group', 'aria-labelledby': 'c-heading' }, [
        el('h2', { id: 'c-heading', text: 'Your consent' }), el('p', { text: view.wording }),
        el('label', { class: 'check', for: 'c-agree' }, [agree, document.createTextNode('I agree')]),
        el('div', { class: 'field' }, [el('label', { class: 'name', for: 'c-sign', text: 'Type your full name to sign' }), name])]),
      problem,
      el('div', { class: 'buttons' }, [sign, no]),
      foot(),
    ]);
  }

  call().then(function (view) { view.state === 'open' ? form(view) : closed(view); })
    .catch(function (e) { show([el('h1', { text: 'May we share what you said?' }), el('p', { class: 'error', role: 'alert', text: e.message })]); });
})();
