/* gate.js — temporary pre-launch password gate (client-side).
 *
 * Hides the page behind a password prompt. The password is never stored in
 * source; only its SHA-256 hash is. Once entered correctly, the unlock is
 * remembered for the browser session (sessionStorage).
 *
 * SCOPE: this gate is included only by this one blog post. To make the post public,
 *   delete this file and remove the <script src="gate.js"></script> line from its index.html.
 *
 * Note: this is a soft client-side gate (the markup still ships to the
 * browser). For a hard gate, put auth at the server/CDN. Uses a self-contained
 * SHA-256 so it works on any host (LAN IP, http, https) — no secure-context /
 * crypto.subtle dependency.
 */
(function () {
  "use strict";
  var KEY = "asmith-cls-gate";
  var HASH = "41ae616098dc844be79a547862902f30e586a2600f33556900af1918a09c58cf"; // sha256("tbd")

  try { if (sessionStorage.getItem(KEY) === "1") return; } catch (e) {}

  var de = document.documentElement;
  de.classList.add("gated");

  var style = document.createElement("style");
  style.textContent =
    ".gated body{display:none!important}" +
    "#site-gate{position:fixed;inset:0;z-index:2147483647;background:#fff;display:flex;" +
    "align-items:center;justify-content:center;" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1b1a18;}" +
    "#site-gate .box{width:min(92vw,320px);text-align:center;}" +
    "#site-gate h1{font-size:1.5rem;font-weight:600;margin:0 0 1.1rem;letter-spacing:-0.01em;}" +
    "#site-gate input{width:100%;box-sizing:border-box;padding:0.7rem 0.9rem;font-size:1rem;" +
    "border:1px solid rgba(27,26,24,0.2);border-radius:8px;outline:none;}" +
    "#site-gate input:focus{border-color:#6a8eea;}" +
    "#site-gate button{margin-top:0.7rem;width:100%;padding:0.7rem;font-size:1rem;font-weight:600;" +
    "color:#fff;background:#6a8eea;border:none;border-radius:8px;cursor:pointer;}" +
    "#site-gate button:hover{background:#7d9bef;}" +
    "#site-gate .err{margin-top:0.6rem;color:#b91c1c;font-size:0.85rem;min-height:1.1em;}";
  (document.head || de).appendChild(style);

  var gate = document.createElement("div");
  gate.id = "site-gate";
  gate.innerHTML =
    '<div class="box">' +
    '<h1>andrew smith</h1>' +
    '<input id="gate-pw" type="password" autocomplete="off" spellcheck="false" placeholder="Password" aria-label="Password" />' +
    '<button id="gate-go" type="button">Enter</button>' +
    '<div class="err" id="gate-err"></div>' +
    "</div>";
  de.appendChild(gate);

  var input = gate.querySelector("#gate-pw");
  var btn = gate.querySelector("#gate-go");
  var err = gate.querySelector("#gate-err");

  // self-contained SHA-256 (hex) — no crypto.subtle, works on any host.
  function sha256(ascii) {
    function r(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mp = Math.pow, mw = mp(2, 32), i, j, result = "", words = [], bl = ascii.length * 8;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], pc = k.length, ic = {};
    for (var c = 2; pc < 64; c++) {
      if (!ic[c]) {
        for (i = 0; i < 313; i += c) { ic[i] = c; }
        hash[pc] = (mp(c, .5) * mw) | 0; k[pc++] = (mp(c, 1 / 3) * mw) | 0;
      }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return;
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (bl / mw) | 0; words[words.length] = bl;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oh = hash; hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (r(w15, 7) ^ r(w15, 18) ^ (w15 >>> 3)) + w[i - 7] +
            (r(w2, 17) ^ r(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash); hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) { hash[i] = (hash[i] + oh[i]) | 0; }
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : "") + b.toString(16);
      }
    }
    return result;
  }
  function utf8(s) { return unescape(encodeURIComponent(s)); }

  function submit() {
    if (sha256(utf8(input.value)) === HASH) {
      try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
      de.classList.remove("gated");
      gate.parentNode && gate.parentNode.removeChild(gate);
      style.parentNode && style.parentNode.removeChild(style);
    } else {
      err.textContent = "Incorrect password.";
      input.value = "";
      input.focus();
    }
  }
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  try { input.focus(); } catch (e) {}
})();
