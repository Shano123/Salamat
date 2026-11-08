/* RSBRI Fashion — art-directed SVG placeholders.
   Every image on the demo site is generated here so the prototype works offline.
   Swap RSBRI.art.* calls for real photography (WebP, CDN) before launch. */
(function () {
  'use strict';

  var cache = {};

  function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
  function hexToRgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function rgbToHex(r) { return '#' + r.map(function (v) { return ('0' + clamp(v).toString(16)).slice(-2); }).join(''); }
  /* amt > 0 lightens toward white, amt < 0 darkens toward black */
  function shade(hex, amt) {
    var c = hexToRgb(hex);
    return rgbToHex(c.map(function (v) { return amt >= 0 ? v + (255 - v) * amt : v * (1 + amt); }));
  }
  function lum(hex) { var c = hexToRgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function contrastInk(hex) { return lum(hex) > 0.55 ? shade(hex, -0.45) : shade(hex, 0.55); }

  function pattern(id, motif, ink, scale, opacity) {
    var s = scale || 1, o = opacity == null ? 0.45 : opacity, t, body;
    switch (motif) {
      case 'floral':
        t = 44 * s;
        body = '<g fill="' + ink + '" opacity="' + o + '">' +
          [[0, -7], [7, 0], [0, 7], [-7, 0]].map(function (d) { return '<circle cx="' + (22 + d[0]) * s + '" cy="' + (22 + d[1]) * s + '" r="' + 5 * s + '"/>'; }).join('') +
          '<circle cx="' + 22 * s + '" cy="' + 22 * s + '" r="' + 3 * s + '" fill="' + shade(ink, 0.5) + '"/>' +
          '<circle cx="0" cy="0" r="' + 2.2 * s + '"/><circle cx="' + t + '" cy="0" r="' + 2.2 * s + '"/><circle cx="0" cy="' + t + '" r="' + 2.2 * s + '"/><circle cx="' + t + '" cy="' + t + '" r="' + 2.2 * s + '"/></g>';
        break;
      case 'paisley':
        t = 56 * s;
        body = '<g fill="none" stroke="' + ink + '" stroke-width="' + 1.6 * s + '" opacity="' + o + '" transform="scale(' + s + ')">' +
          '<path d="M20 40c-9 0-14-8-11-16 3-9 15-12 19-22 3 9 2 19-2 26-1 7-2 12-6 12z"/>' +
          '<circle cx="17" cy="31" r="3"/><path d="M48 14c-5 0-8-4-6-9 2-4 8-6 10-11 2 5 1 10-1 14-1 4-1 6-3 6z" transform="translate(0 6)"/></g>';
        break;
      case 'lattice':
        t = 40 * s;
        body = '<g fill="none" stroke="' + ink + '" stroke-width="' + 1.3 * s + '" opacity="' + o + '">' +
          '<path d="M0 ' + 20 * s + 'L' + 20 * s + ' 0L' + 40 * s + ' ' + 20 * s + 'L' + 20 * s + ' ' + 40 * s + 'Z"/>' +
          '<circle cx="' + 20 * s + '" cy="' + 20 * s + '" r="' + 3.2 * s + '" fill="' + ink + '"/></g>';
        break;
      case 'dots':
        t = 20 * s;
        body = '<circle cx="' + 10 * s + '" cy="' + 10 * s + '" r="' + 2.6 * s + '" fill="' + ink + '" opacity="' + o + '"/>';
        break;
      case 'stripe':
        t = 18 * s;
        body = '<rect x="0" y="0" width="' + 5 * s + '" height="' + t + '" fill="' + ink + '" opacity="' + o + '"/><rect x="' + 9 * s + '" y="0" width="' + 1.2 * s + '" height="' + t + '" fill="' + ink + '" opacity="' + o * 0.7 + '"/>';
        break;
      case 'check':
        t = 32 * s;
        body = '<g fill="' + ink + '"><rect width="' + t + '" height="' + 8 * s + '" opacity="' + o * 0.55 + '"/><rect width="' + 8 * s + '" height="' + t + '" opacity="' + o * 0.55 + '"/><rect x="' + 20 * s + '" width="' + 1.5 * s + '" height="' + t + '" opacity="' + o + '"/></g>';
        break;
      default: /* plain — subtle weave */
        t = 6 * s;
        body = '<path d="M0 ' + 3 * s + 'H' + t + '" stroke="' + ink + '" stroke-width="' + 0.6 * s + '" opacity="' + o * 0.35 + '"/>';
    }
    return '<pattern id="' + id + '" width="' + t + '" height="' + t + '" patternUnits="userSpaceOnUse">' + body + '</pattern>';
  }

  function grain(id) {
    return '<filter id="' + id + '"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>';
  }

  function svgUri(w, h, inner) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice">' + inner + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }

  function archPath(x, y, w, h) {
    return 'M' + x + ' ' + (y + h) + 'V' + (y + h * 0.36) + 'C' + x + ' ' + (y + h * 0.12) + ' ' + (x + w * 0.3) + ' ' + (y + h * 0.05) + ' ' + (x + w / 2) + ' ' + y +
      'C' + (x + w * 0.7) + ' ' + (y + h * 0.05) + ' ' + (x + w) + ' ' + (y + h * 0.12) + ' ' + (x + w) + ' ' + (y + h * 0.36) + 'V' + (y + h) + 'Z';
  }

  /* ----- product compositions (600 × 800, 3:4) ----- */
  var KURTA = 'M238 128Q300 168 362 128L438 156L506 430L458 446L404 262L414 706L186 706L196 262L142 446L94 430L162 156Z';

  function kurta(c, motif, ink, pid, studio) {
    return '<rect width="600" height="800" fill="' + studio + '"/>' +
      '<path d="' + archPath(90, 60, 420, 700) + '" fill="' + shade(studio, -0.05) + '"/>' +
      '<ellipse cx="300" cy="730" rx="190" ry="16" fill="#000" opacity=".08"/>' +
      '<path d="M300 70v40M262 128q38-34 76 0" stroke="#6b5f55" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path d="' + KURTA + '" fill="' + c + '"/>' +
      '<path d="' + KURTA + '" fill="url(#' + pid + ')"/>' +
      '<path d="M258 140Q300 230 342 140" fill="none" stroke="' + shade(ink, 0.15) + '" stroke-width="7" opacity=".7"/>' +
      '<path d="M190 676H410" stroke="' + shade(ink, 0.1) + '" stroke-width="14" opacity=".55"/>' +
      '<path d="M191 660H409" stroke="#C9A45C" stroke-width="2" stroke-dasharray="2 6" opacity=".9"/>' +
      '<path d="M404 262L414 706M196 262L186 706" stroke="#000" stroke-opacity=".08" stroke-width="6"/>';
  }

  function folded(c, motif, ink, pid, studio) {
    var out = '<rect width="600" height="800" fill="' + studio + '"/>' +
      '<rect x="0" y="560" width="600" height="240" fill="' + shade(studio, -0.06) + '"/>' +
      '<ellipse cx="300" cy="640" rx="230" ry="20" fill="#000" opacity=".1"/>';
    var layers = [[110, 470, 380, 160, shade(c, -0.18)], [126, 360, 350, 140, shade(c, 0.35)], [140, 250, 320, 140, c]];
    layers.forEach(function (l, i) {
      out += '<rect x="' + l[0] + '" y="' + l[1] + '" width="' + l[2] + '" height="' + l[3] + '" rx="10" fill="' + l[4] + '"/>';
      out += '<rect x="' + l[0] + '" y="' + l[1] + '" width="' + l[2] + '" height="' + l[3] + '" rx="10" fill="url(#' + pid + ')" opacity="' + (i === 1 ? 0.35 : 1) + '"/>';
      out += '<rect x="' + l[0] + '" y="' + (l[1] + l[3] - 16) + '" width="' + l[2] + '" height="16" rx="6" fill="#000" opacity=".08"/>';
    });
    out += '<rect x="140" y="250" width="320" height="22" fill="' + shade(ink, 0.05) + '" opacity=".5"/>' +
      '<path d="M146 282H454" stroke="#C9A45C" stroke-width="2.4" stroke-dasharray="3 7"/>' +
      '<path d="M420 236c40 20 70 70 60 140" fill="none" stroke="' + shade(c, 0.5) + '" stroke-width="26" stroke-linecap="round" opacity=".85"/>' +
      '<rect x="230" y="190" width="140" height="34" rx="2" fill="#fbf8f2" opacity=".92"/><text x="300" y="213" font-family="Georgia,serif" font-size="15" letter-spacing="4" text-anchor="middle" fill="#3a302a">RSBRI</text>';
    return out;
  }

  function dupatta(c, motif, ink, pid, studio) {
    var d = 'M150 120C260 90 360 110 450 130C420 300 470 460 430 700C330 720 250 700 170 690C200 520 120 330 150 120Z';
    return '<rect width="600" height="800" fill="' + studio + '"/>' +
      '<path d="' + archPath(80, 50, 440, 720) + '" fill="' + shade(studio, -0.05) + '"/>' +
      '<path d="' + d + '" fill="' + c + '"/><path d="' + d + '" fill="url(#' + pid + ')"/>' +
      '<path d="M170 690C250 700 330 720 430 700" stroke="#C9A45C" stroke-width="10" fill="none" opacity=".8"/>' +
      Array.apply(null, Array(12)).map(function (_, i) { var x = 182 + i * 21; return '<path d="M' + x + ' ' + (696 + (i % 3) * 3) + 'v28" stroke="' + shade(c, -0.25) + '" stroke-width="3"/>'; }).join('') +
      '<path d="M260 140C240 320 300 480 260 690" stroke="#000" stroke-opacity=".07" stroke-width="20" fill="none"/>';
  }

  function bed(c, motif, ink, pid, wall) {
    var head = shade(c, lum(c) > 0.6 ? -0.35 : -0.25);
    return '<rect width="600" height="800" fill="' + wall + '"/>' +
      '<rect y="600" width="600" height="200" fill="' + shade(wall, -0.12) + '"/>' +
      '<rect x="40" y="250" width="520" height="230" rx="18" fill="' + head + '"/>' +
      '<rect x="56" y="266" width="488" height="200" rx="12" fill="none" stroke="' + shade(head, 0.2) + '" stroke-width="2"/>' +
      '<rect x="24" y="440" width="552" height="210" rx="14" fill="' + c + '"/>' +
      '<rect x="24" y="440" width="552" height="210" rx="14" fill="url(#' + pid + ')"/>' +
      '<rect x="24" y="500" width="552" height="34" fill="' + shade(c, 0.45) + '" opacity=".85"/>' +
      '<rect x="24" y="500" width="552" height="34" fill="url(#' + pid + ')" opacity=".4"/>' +
      '<rect x="78" y="380" width="200" height="90" rx="30" fill="' + shade(c, 0.6) + '"/>' +
      '<rect x="322" y="380" width="200" height="90" rx="30" fill="' + shade(c, 0.6) + '"/>' +
      '<rect x="160" y="404" width="130" height="70" rx="20" fill="' + c + '"/><rect x="160" y="404" width="130" height="70" rx="20" fill="url(#' + pid + ')"/>' +
      '<rect x="310" y="404" width="130" height="70" rx="20" fill="' + c + '"/><rect x="310" y="404" width="130" height="70" rx="20" fill="url(#' + pid + ')"/>' +
      '<rect x="24" y="636" width="552" height="18" rx="6" fill="#000" opacity=".1"/>' +
      '<path d="M500 150h44l-10 40h-24z" fill="#efe6d4"/><path d="M522 190v60" stroke="#8b7a66" stroke-width="3"/>';
  }

  function cushion(c, motif, ink, pid, wall) {
    return '<rect width="600" height="800" fill="' + wall + '"/>' +
      '<rect x="0" y="460" width="600" height="340" fill="' + shade(wall, -0.18) + '"/>' +
      '<rect x="0" y="440" width="600" height="40" fill="' + shade(wall, -0.24) + '"/>' +
      '<g transform="rotate(-6 300 380)"><rect x="140" y="220" width="320" height="320" rx="46" fill="' + c + '"/>' +
      '<rect x="140" y="220" width="320" height="320" rx="46" fill="url(#' + pid + ')"/>' +
      '<rect x="164" y="244" width="272" height="272" rx="30" fill="none" stroke="#C9A45C" stroke-width="2" stroke-dasharray="3 6"/>' +
      '<circle cx="146" cy="226" r="9" fill="#C9A45C"/><circle cx="454" cy="226" r="9" fill="#C9A45C"/><circle cx="146" cy="534" r="9" fill="#C9A45C"/><circle cx="454" cy="534" r="9" fill="#C9A45C"/></g>' +
      '<ellipse cx="300" cy="580" rx="180" ry="14" fill="#000" opacity=".1"/>';
  }

  var SHAPES = { kurta: kurta, folded: folded, dupatta: dupatta, bed: bed, cushion: cushion };

  /* view: 0 = main, 1 = fabric close-up, 2 = detail/embroidery, 3 = styled (alternate background) */
  function product(p, colorIndex, view) {
    colorIndex = colorIndex || 0; view = view || 0;
    var key = p.id + ':' + colorIndex + ':' + view;
    if (cache[key]) return cache[key];
    var c = p.colors[colorIndex % p.colors.length].hex;
    var ink = contrastInk(c);
    var pid = 'p' + p.id + colorIndex + view;
    var studios = ['#F2ECE2', '#ECE4D6', '#E9E3DA', '#EFE7DD'];
    var studio = view === 3 ? shade(c, lum(c) > 0.6 ? -0.12 : 0.78) : studios[(p.id.charCodeAt(5) || 0) % studios.length];
    var inner;
    if (view === 1) {
      inner = '<defs>' + pattern(pid, p.motif === 'plain' ? 'dots' : p.motif, ink, 2.6, 0.55) +
        '<linearGradient id="g' + pid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient></defs>' +
        '<rect width="600" height="800" fill="' + c + '"/><rect width="600" height="800" fill="url(#' + pid + ')"/>' +
        '<path d="M-40 260C160 200 300 360 640 280V420C360 500 160 360 -40 430Z" fill="#000" opacity=".07"/>' +
        '<rect width="600" height="800" fill="url(#g' + pid + ')"/>';
    } else if (view === 2) {
      inner = '<defs>' + pattern(pid, 'lattice', '#C9A45C', 1.8, 0.85) + '</defs>' +
        '<rect width="600" height="800" fill="' + shade(c, -0.08) + '"/>' +
        '<rect x="0" y="260" width="600" height="280" fill="url(#' + pid + ')"/>' +
        '<path d="M0 250H600M0 550H600" stroke="#C9A45C" stroke-width="4"/>' +
        '<path d="M0 236H600M0 564H600" stroke="#C9A45C" stroke-width="1.5" stroke-dasharray="2 8"/>' +
        '<circle cx="300" cy="400" r="70" fill="none" stroke="#E7CF92" stroke-width="3"/><circle cx="300" cy="400" r="20" fill="#E7CF92"/>';
    } else {
      inner = '<defs>' + pattern(pid, p.motif, ink, 1, p.motif === 'plain' ? 0.6 : 0.42) + '</defs>' + SHAPES[p.shape](c, p.motif, ink, pid, studio);
    }
    inner += '<defs>' + grain('n' + pid) + '</defs><rect width="600" height="800" filter="url(#n' + pid + ')" opacity=".9"/>';
    return (cache[key] = svgUri(600, 800, inner));
  }

  /* ----- campaign banners ----- */
  function hero(tone, subject, mobile) {
    var key = 'hero:' + tone.join() + subject + (mobile ? 'm' : 'd');
    if (cache[key]) return cache[key];
    var bg = tone[0], light = tone[1], gold = tone[2];
    var W = mobile ? 800 : 1600, H = mobile ? 1000 : 820;
    var ax = mobile ? 220 : 860, aw = mobile ? 360 : 520, ay = mobile ? 480 : 90, ah = mobile ? 520 : 730;
    var inner = '<defs>' + pattern('hl', 'lattice', gold, 1.4, 0.16) +
      '<radialGradient id="hg" cx="' + (mobile ? '.5' : '.7') + '" cy=".55" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient></defs>' +
      '<rect width="' + W + '" height="' + H + '" fill="' + bg + '"/><rect width="' + W + '" height="' + H + '" fill="url(#hl)"/><rect width="' + W + '" height="' + H + '" fill="url(#hg)"/>' +
      '<path d="' + archPath(ax - 26, ay - 26, aw + 52, ah + 60) + '" fill="none" stroke="' + gold + '" stroke-width="2" opacity=".7"/>' +
      '<path d="' + archPath(ax, ay, aw, ah) + '" fill="' + light + '"/>';
    var cx = ax + aw / 2, base = ay + ah;
    if (subject === 'bed') {
      var bw = aw * 0.92, bx = cx - bw / 2;
      inner += '<defs>' + pattern('hb', 'paisley', gold, 1.2, 0.55) + '</defs>' +
        '<rect x="' + (bx + 20) + '" y="' + (base - 330) + '" width="' + (bw - 40) + '" height="180" rx="16" fill="' + shade(bg, -0.2) + '"/>' +
        '<rect x="' + bx + '" y="' + (base - 190) + '" width="' + bw + '" height="170" rx="12" fill="' + bg + '"/>' +
        '<rect x="' + bx + '" y="' + (base - 190) + '" width="' + bw + '" height="170" rx="12" fill="url(#hb)"/>' +
        '<rect x="' + bx + '" y="' + (base - 150) + '" width="' + bw + '" height="26" fill="' + light + '" opacity=".85"/>' +
        '<rect x="' + (bx + 40) + '" y="' + (base - 240) + '" width="' + (bw / 2 - 60) + '" height="70" rx="24" fill="' + shade(light, 0.4) + '"/>' +
        '<rect x="' + (cx + 20) + '" y="' + (base - 240) + '" width="' + (bw / 2 - 60) + '" height="70" rx="24" fill="' + shade(light, 0.4) + '"/>';
    } else {
      var sc = (ah * 0.88) / 800, tx = cx - 300 * sc, ty = base - 760 * sc;
      inner += '<defs>' + pattern('hk', 'floral', gold, 1, 0.5) + '</defs>' +
        '<g transform="translate(' + tx + ' ' + ty + ') scale(' + sc + ')">' +
        '<ellipse cx="300" cy="740" rx="200" ry="16" fill="#000" opacity=".12"/>' +
        '<path d="' + KURTA + '" fill="' + bg + '"/><path d="' + KURTA + '" fill="url(#hk)"/>' +
        '<path d="M258 140Q300 230 342 140" fill="none" stroke="' + gold + '" stroke-width="6"/>' +
        '<path d="M190 670H410" stroke="' + gold + '" stroke-width="16" opacity=".85"/>' +
        '<path d="M300 70v40M262 128q38-34 76 0" stroke="' + gold + '" stroke-width="4" fill="none" stroke-linecap="round"/></g>';
    }
    inner += '<rect y="' + (H - 6) + '" width="' + W + '" height="6" fill="' + gold + '" opacity=".8"/>';
    return (cache[key] = svgUri(W, H, inner));
  }

  /* Social gallery square */
  function social(p, i) {
    return product(p, i % p.colors.length, i % 2 ? 3 : 0);
  }

  window.RSBRI = window.RSBRI || {};
  window.RSBRI.art = { product: product, hero: hero, social: social, shade: shade };
})();
