// Ayarlar > Proje ve ortamlar > "Servis taban adresleri": tüm servislerin ortam başına taban adresleri tek tabloda.
// İki görünüm (seçim tarayıcıda hatırlanır; yalnız görünüm):
//  - Adrese göre (varsayılan): satır = ortamlardaki taban adres kombinasyonu aynı olan servis grubu. Hücre değişince gruptaki
//    tüm servisler birlikte değişir. "Bu ortamda yok" olan servis grubu bölmez: o ortamda "yok" olarak kalır (hücrede "N serviste
//    yok" notu). "▸ N servis" üyeleri listeler; "Gruptan ayır" servisi kendi özel adresine geçirir ve ayrı satırda gösterir.
//  - Servis bazında: satır = servis, sütun = ortam (önceki tablo).
// Toplu düzenleme (iki görünümde): bul-değiştir (seçili ortamda / seçili satırlarda), çoklu seçimle atama ve adlandırılmış taban
// adres (aynı sunucuyu paylaşan servisler tek ada bağlanır; bir hücre değişince bağlı tümü değişir).
// Değişiklikler önce tarayıcıda taslaktır; "Etkiyi göster" hangi servislerin, kaç senaryo / akışın etkileneceğini ve eski → yeni
// adresleri listeler; YALNIZ "Onayla ve kaydet" ile yazılır. Yazılan veri modeli servis başınadır (grup yalnız görünümdür).
// Hiçbir servise istek atılmaz (erişim kontrolü servis sayfasından).
import { adresGecerliMi, alan, api, bildir, h, ikon, iskelet, mesajKutusu, mesgulIken, rozet, yeniKimlik, yerlestir } from './ortak.js';

const MOD_ETIKETI = { ortam: 'Ortamın adresi', yok: 'Bu ortamda yok', servis: 'Özel adres' };
const GORUNUM_ANAHTARI = 'nobetci-taban-adresleri-gorunum';
const temiz = (a) => String(a || '').trim().replace(/\/+$/, '');
const gorunumOku = () => { try { return localStorage.getItem(GORUNUM_ANAHTARI) === 'servis' ? 'servis' : 'adres'; } catch { return 'adres'; } };
const gorunumYaz = (g) => { try { localStorage.setItem(GORUNUM_ANAHTARI, g); } catch { /* yok sayılır */ } };
const sunucuAdi = (a) => { try { return new URL(a).host || a; } catch { return a; } };

/** @param {{ id: string; ad: string }} proje @returns {HTMLElement} */
export function tabanAdresleriBolumu(proje) {
  const kap = h('section', { class: 'taban-adresleri', 'aria-labelledby': 'taban-adresleri-basligi' }, iskelet('liste'));
  yukle(kap, proje).catch((e) => { if (!e || e.durum !== 423) yerlestir(kap, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message || String(e))); });
  return kap;
}

async function yukle(kap, proje) {
  const veri = await api(`/platform/servis-tabanlari?projeId=${encodeURIComponent(proje.id)}`);
  const { ortamlar, satirlar } = veri;
  const baslik = h('div', { class: 'bolum-basligi' }, h('h3', { id: 'taban-adresleri-basligi' }, 'Servis taban adresleri', rozet(String(satirlar.length))));
  if (!satirlar.length) {
    yerlestir(kap, baslik, h('p', { class: 'soluk kucuk' }, 'Henüz servis yok. Servis eklenince taban adresleri burada toplu düzenlenir.'));
    return;
  }
  /** Özgün ve taslak hücreler: servisId → { grup, hucreler: { ortamId: { mod, deger } } }. */
  const kopya = (s) => ({ grup: s.grup || '', hucreler: Object.fromEntries(ortamlar.map((o) => {
    const x = s.tabanlar[o.id];
    return [o.id, { mod: x.kaynak, deger: x.kaynak === 'servis' || x.kaynak === 'eski' ? x.deger : '' }];
  })) });
  const ozgun = new Map(satirlar.map((s) => [s.servisId, kopya(s)]));
  const taslak = new Map(satirlar.map((s) => [s.servisId, kopya(s)]));
  const servis = new Map(satirlar.map((s) => [s.servisId, s]));
  const secili = new Set();
  /** Adrese göre görünüm: gruptan ayrılan servisler (kayda / geri almaya kadar ayrı satır) ve açık üye listeleri. */
  const ayrik = new Set();
  const acikGruplar = new Set();
  let gorunum = gorunumOku();
  const mesaj = mesajKutusu();
  const tabloKap = h('div', { class: 'tablo-kaydirma' });
  const etkiKap = h('div', { 'aria-live': 'polite' });
  const durumMetni = h('span', { class: 'soluk kucuk', 'aria-live': 'polite' });
  const gruplar = () => [...new Set([...taslak.values()].map((t) => t.grup).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const grupListesi = h('datalist', { id: yeniKimlik('taban-gruplari') });

  /** Hücre değişince: satır bir ada bağlıysa aynı addaki tüm servislere uygulanır. */
  const hucreAta = (servisId, ortamId, hucre) => {
    const t = taslak.get(servisId);
    const hedefler = t.grup ? [...taslak.entries()].filter(([, x]) => x.grup === t.grup).map(([id]) => id) : [servisId];
    for (const id of hedefler) {
      const x = taslak.get(id);
      if (x.hucreler[ortamId].mod === 'eski') continue;
      x.hucreler[ortamId] = { ...hucre };
    }
  };
  /** Ada bağlama: adın başka üyesi varsa onun adresleri bu servise kopyalanır (addaki servislerin adresleri aynıdır). */
  const grupAta = (servisId, ad) => {
    const t = taslak.get(servisId);
    t.grup = ad.trim();
    const uye = t.grup ? [...taslak.entries()].find(([id, x]) => id !== servisId && x.grup === t.grup) : null;
    if (uye) for (const o of ortamlar) if (t.hucreler[o.id].mod !== 'eski') t.hucreler[o.id] = { ...uye[1].hucreler[o.id] };
  };

  // --- Adrese göre gruplama ------------------------------------------------------------------------------------------
  /** Hücrenin gruplama anahtarı: '*' = bu ortamda yok (grubu bölmez). */
  const hucreAnahtari = (x) => (x.mod === 'yok' ? '*' : x.mod === 'ortam' ? 'o' : x.mod === 'eski' ? `e:${x.deger}` : `s:${temiz(x.deger)}`);
  /**
   * Satırlar: ortamlardaki anahtar kombinasyonu aynı olan servisler. Bazı ortamlarda "yok" olan servis, tanımlı olduğu ortamlarda
   * adresleri aynı olan gruba katılır (aynı ada bağlı üyesi olan grup, sonra en kalabalık grup); uyan grup yoksa kendi satırıdır.
   * @returns {Array<{ kimlik: string; anahtar: string[]; uyeler: string[] }>}
   */
  const adresGruplari = () => {
    /** @type {Array<{ kimlik: string; anahtar: string[]; uyeler: string[] }>} */
    const liste = [];
    const tamlar = new Map();
    const bekleyen = [];
    for (const s of satirlar) {
      const t = taslak.get(s.servisId);
      const anahtar = ortamlar.map((o) => hucreAnahtari(t.hucreler[o.id]));
      if (ayrik.has(s.servisId)) { liste.push({ kimlik: `ayrik:${s.servisId}`, anahtar, uyeler: [s.servisId], ayrik: true }); continue; }
      if (anahtar.includes('*') && anahtar.some((x) => x !== '*')) { bekleyen.push({ id: s.servisId, anahtar }); continue; }
      const k = JSON.stringify(anahtar);
      if (!tamlar.has(k)) { const g = { kimlik: '', anahtar, uyeler: [] }; tamlar.set(k, g); liste.push(g); }
      tamlar.get(k).uyeler.push(s.servisId);
    }
    const yildiz = (a) => a.filter((x) => x === '*').length;
    bekleyen.sort((a, b) => yildiz(a.anahtar) - yildiz(b.anahtar));
    for (const b of bekleyen) {
      const ad = taslak.get(b.id).grup;
      const uyanlar = liste.filter((g) => !g.ayrik && b.anahtar.every((x, i) => x === '*' || x === g.anahtar[i]));
      const puan = (g) => [ad && g.uyeler.some((id) => taslak.get(id).grup === ad) ? 1 : 0, g.uyeler.length, -yildiz(g.anahtar)];
      uyanlar.sort((x, y) => { const a = puan(x); const c = puan(y); return c[0] - a[0] || c[1] - a[1] || c[2] - a[2]; });
      if (uyanlar.length) uyanlar[0].uyeler.push(b.id);
      else { const g = { kimlik: '', anahtar: b.anahtar, uyeler: [b.id] }; liste.push(g); }
    }
    const adSirasi = (id) => servis.get(id).ad;
    for (const g of liste) {
      g.uyeler.sort((a, b) => adSirasi(a).localeCompare(adSirasi(b), 'tr'));
      if (!g.kimlik) g.kimlik = `g:${[...g.uyeler].sort()[0]}`;
    }
    return liste.sort((a, b) => b.uyeler.length - a.uyeler.length || grupEtiketi(a).localeCompare(grupEtiketi(b), 'tr'));
  };
  const grupAdlari = (g) => [...new Set(g.uyeler.map((id) => taslak.get(id).grup).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  /** Adres kısaltması: sunucu adları (ortamın adresini kullanan hücre "ortamın adresi"). */
  const kisaltma = (g) => {
    const parcalar = [...new Set(g.anahtar.filter((x) => x !== '*').map((x) => (x === 'o' ? 'Ortamın adresi' : sunucuAdi(x.slice(2)))))];
    if (!parcalar.length) return 'Tüm ortamlarda yok';
    return parcalar.slice(0, 2).join(' · ') + (parcalar.length > 2 ? ' …' : '');
  };
  const grupEtiketi = (g) => grupAdlari(g).join(', ') || kisaltma(g);
  /** Grup hücresi değişince: satırdaki tüm servisler (ve aynı ada bağlı diğer servisler) birlikte değişir; "yok" olanlar korunur. */
  const grupHucreAta = (uyeler, ortamId, yeni) => {
    const hedef = new Set(uyeler);
    const adlar = new Set(uyeler.map((id) => taslak.get(id).grup).filter(Boolean));
    for (const [id, x] of taslak) if (x.grup && adlar.has(x.grup)) hedef.add(id);
    const hepsiYok = [...hedef].every((id) => taslak.get(id).hucreler[ortamId].mod === 'yok');
    for (const id of hedef) {
      const x = taslak.get(id).hucreler[ortamId];
      if (x.mod === 'eski' || (x.mod === 'yok' && yeni.mod !== 'yok' && !hepsiYok)) continue;
      taslak.get(id).hucreler[ortamId] = { ...yeni };
    }
  };
  /** Satırı ada bağlama: adın satır dışında üyesi varsa onun (tanımlı) adresleri satıra kopyalanır. */
  const grupSatiriniAdlandir = (uyeler, deger) => {
    const ad = deger.trim();
    const kaynak = ad ? [...taslak.entries()].find(([id, x]) => !uyeler.includes(id) && x.grup === ad)?.[1] : null;
    for (const id of uyeler) {
      const t = taslak.get(id);
      t.grup = ad;
      if (!kaynak) continue;
      for (const o of ortamlar) {
        const a = t.hucreler[o.id];
        const k = kaynak.hucreler[o.id];
        if (a.mod !== 'eski' && a.mod !== 'yok' && k.mod !== 'eski' && k.mod !== 'yok') t.hucreler[o.id] = { ...k };
      }
    }
  };
  /** Gruptan ayır: servis ada bağlı değilse de ayrı satır olur; "ortamın adresi" hücreleri aynı adresle özel adrese geçer. */
  const gruptanAyir = (id) => {
    const t = taslak.get(id);
    t.grup = '';
    for (const o of ortamlar) if (t.hucreler[o.id].mod === 'ortam') t.hucreler[o.id] = { mod: 'servis', deger: temiz(o.tabanUrl) };
    ayrik.add(id);
  };

  const degisiklikler = () => {
    const d = {};
    for (const s of satirlar) {
      const o0 = ozgun.get(s.servisId);
      const t = taslak.get(s.servisId);
      const tabanlar = {};
      for (const o of ortamlar) {
        const a = o0.hucreler[o.id];
        const b = t.hucreler[o.id];
        if (a.mod === b.mod && temiz(a.deger) === temiz(b.deger)) continue;
        tabanlar[o.id] = b.mod === 'servis' ? temiz(b.deger) : b.mod === 'yok' ? '' : null;
      }
      const grupDegisti = (o0.grup || '') !== (t.grup || '');
      if (Object.keys(tabanlar).length || grupDegisti) d[s.servisId] = { ...(Object.keys(tabanlar).length ? { tabanlar } : {}), ...(grupDegisti ? { grup: t.grup || null } : {}) };
    }
    return d;
  };
  const durumGuncelle = () => {
    const n = Object.keys(degisiklikler()).length;
    durumMetni.textContent = n ? `${n} serviste kaydedilmemiş değişiklik var.` : 'Değişiklik yok.';
    etkiGoster.disabled = !n;
    geriAl.disabled = !n;
  };
  const hucreDegisti = (id, ortamId) => { const a = ozgun.get(id).hucreler[ortamId]; const b = taslak.get(id).hucreler[ortamId]; return a.mod !== b.mod || temiz(a.deger) !== temiz(b.deger); };

  /** Adres türü + adres girdisi (iki görünümde ortak). ata: yeni hücreyi uygular. */
  const hucreDenetimi = (etiket, o, x, ata) => {
    const mod = h('select', { 'aria-label': `${etiket}: adres türü` },
      Object.entries(MOD_ETIKETI).map(([m, e]) => h('option', { value: m, selected: x.mod === m }, m === 'ortam' ? `${e} (${temiz(o.tabanUrl)})` : e)));
    const girdi = h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', value: x.deger, placeholder: 'https://', hidden: x.mod !== 'servis', 'aria-label': `${etiket}: taban adres`,
      list: o.tabanAdresleri.length ? `${grupListesi.id}-${o.id}` : null });
    mod.addEventListener('change', () => { ata({ mod: mod.value, deger: mod.value === 'servis' ? (x.deger || temiz(o.tabanUrl)) : '' }); ciz(); });
    girdi.addEventListener('change', () => { ata({ mod: 'servis', deger: girdi.value.trim() }); ciz(); });
    return [h('div', { class: 'taban-hucresi' }, mod, girdi),
      x.mod === 'servis' && x.deger && !adresGecerliMi(x.deger) ? h('div', { class: 'alan-hatasi', role: 'alert' }, 'http:// ya da https:// ile başlamalı') : null];
  };
  const eskiHucre = (x) => [h('code', { class: 'duz', title: 'Eski tam adres ayarı (servis sayfasında İşlemler > Taban adresler ile değiştirilir)' }, x.deger), ' ', rozet('tam adres', 'durdu')];

  const hucre = (s, o) => {
    const x = taslak.get(s.servisId).hucreler[o.id];
    if (x.mod === 'eski') return h('td', {}, eskiHucre(x));
    return h('td', { class: hucreDegisti(s.servisId, o.id) ? 'degisti' : null }, hucreDenetimi(`${s.ad} · ${o.ad}`, o, x, (y) => hucreAta(s.servisId, o.id, y)));
  };

  const hepsi = h('input', { type: 'checkbox', 'aria-label': 'Tüm servisleri seç' });
  hepsi.addEventListener('change', () => { for (const s of satirlar) if (hepsi.checked) secili.add(s.servisId); else secili.delete(s.servisId); ciz(); });
  const ortamBasliklari = () => ortamlar.map((o) => h('th', { scope: 'col' }, o.ad, ' ', rozet(o.canli ? 'CANLI' : 'TEST', o.canli ? 'hata' : '')));
  const turRozeti = (s) => rozet(s.tur === 'rest' ? 'REST' : 'SOAP', 'vurgu');

  /** Servis bazında görünüm: satır = servis (önceki tablo). */
  const servisTablosu = () => {
    const sirali = [...satirlar].sort((a, b) => (taslak.get(a.servisId).grup || '￿').localeCompare(taslak.get(b.servisId).grup || '￿', 'tr') || a.ad.localeCompare(b.ad, 'tr'));
    return h('table', { class: 'ozet-tablosu taban-tablosu', 'aria-label': 'Servis taban adresleri' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, hepsi), h('th', { scope: 'col' }, 'Servis'), h('th', { scope: 'col' }, 'Taban adres adı'), ortamBasliklari())),
      h('tbody', {}, sirali.map((s) => {
        const t = taslak.get(s.servisId);
        const sec = h('input', { type: 'checkbox', checked: secili.has(s.servisId), 'aria-label': `${s.ad} seç` });
        sec.addEventListener('change', () => { if (sec.checked) secili.add(s.servisId); else secili.delete(s.servisId); hepsi.checked = secili.size === satirlar.length; });
        const grup = h('input', { type: 'text', autocomplete: 'off', value: t.grup, maxlength: '60', placeholder: 'ad yok', list: grupListesi.id, 'aria-label': `${s.ad}: taban adres adı` });
        grup.addEventListener('change', () => { grupAta(s.servisId, grup.value); ciz(); });
        return h('tr', {},
          h('td', {}, sec),
          h('th', { scope: 'row' }, s.ad, ' ', turRozeti(s),
            h('div', { class: 'soluk kucuk' }, h('code', { class: 'duz' }, s.yol || '—'), ` · ${s.senaryoSayisi} senaryo${s.akislar.length ? ` · ${s.akislar.length} akış` : ''}`)),
          h('td', { class: (ozgun.get(s.servisId).grup || '') !== (t.grup || '') ? 'degisti' : null }, grup),
          ortamlar.map((o) => hucre(s, o)));
      })));
  };

  /** Adrese göre görünüm: satır = aynı adres kombinasyonundaki servisler. */
  const adresTablosu = () => {
    const sutunSayisi = 3 + ortamlar.length;
    return h('table', { class: 'ozet-tablosu taban-tablosu taban-gruplu', 'aria-label': 'Servis taban adresleri (adrese göre)', 'data-siralama': 'yok' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, hepsi), h('th', { scope: 'col' }, 'Taban adres adı'), ortamBasliklari(), h('th', { scope: 'col' }, 'Kullanan'))),
      h('tbody', {}, adresGruplari().flatMap((g) => {
        const adlar = grupAdlari(g);
        const etiket = grupEtiketi(g);
        const tumSecili = g.uyeler.every((id) => secili.has(id));
        const sec = h('input', { type: 'checkbox', checked: tumSecili, 'aria-label': `${etiket}: grubu seç` });
        sec.addEventListener('change', () => { for (const id of g.uyeler) if (sec.checked) secili.add(id); else secili.delete(id); hepsi.checked = secili.size === satirlar.length; });
        const ortakAd = adlar.length === 1 ? adlar[0] : '';
        const adGirdisi = h('input', { type: 'text', autocomplete: 'off', value: ortakAd, maxlength: '60', placeholder: adlar.length > 1 ? 'karışık' : 'ad yok', list: grupListesi.id, 'aria-label': `${etiket}: taban adres adı` });
        adGirdisi.addEventListener('change', () => { grupSatiriniAdlandir(g.uyeler, adGirdisi.value); ciz(); });
        const adDegisti = g.uyeler.some((id) => (ozgun.get(id).grup || '') !== (taslak.get(id).grup || ''));
        const hucreler = ortamlar.map((o, i) => {
          const yoklar = g.uyeler.filter((id) => taslak.get(id).hucreler[o.id].mod === 'yok');
          const temsilci = g.uyeler.find((id) => taslak.get(id).hucreler[o.id].mod !== 'yok') ?? g.uyeler[0];
          const x = taslak.get(temsilci).hucreler[o.id];
          const not = yoklar.length && yoklar.length < g.uyeler.length ? h('div', { class: 'soluk kucuk taban-yok-notu' }, `${yoklar.length} serviste yok`) : null;
          const degisti = g.uyeler.some((id) => hucreDegisti(id, o.id));
          if (g.anahtar[i].startsWith('e:')) return h('td', {}, eskiHucre(x), not);
          return h('td', { class: degisti ? 'degisti' : null }, hucreDenetimi(`${etiket} · ${o.ad}`, o, x, (y) => grupHucreAta(g.uyeler, o.id, y)), not);
        });
        const acik = acikGruplar.has(g.kimlik);
        const listeId = `taban-grup-${g.kimlik.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const kullanan = h('button', { type: 'button', class: 'taban-kullanan', 'aria-expanded': acik ? 'true' : 'false', 'aria-controls': listeId, 'aria-label': `${etiket} — Kullanan: ${g.uyeler.length} servis` },
          `Kullanan: ${g.uyeler.length} servis `, h('span', { 'aria-hidden': 'true' }, acik ? '▾' : '▸'));
        kullanan.addEventListener('click', () => { if (acik) acikGruplar.delete(g.kimlik); else acikGruplar.add(g.kimlik); ciz(); });
        const satir = h('tr', { class: g.ayrik ? 'taban-ayrik' : null },
          h('td', {}, sec),
          h('th', { scope: 'row', class: adDegisti ? 'degisti' : null },
            h('div', { class: 'taban-grup-adi' }, h('b', {}, etiket), g.ayrik ? rozet('ayrıldı', 'durdu') : null),
            adlar.length ? null : h('div', { class: 'soluk kucuk' }, 'adres kısaltması'),
            adGirdisi),
          hucreler,
          h('td', {}, kullanan));
        if (!acik) return [satir];
        const uyeListesi = h('tr', { class: 'taban-grup-uyeleri', id: listeId }, h('td', { colspan: String(sutunSayisi) },
          h('ul', { class: 'taban-uye-listesi', 'aria-label': `${etiket}: servisler` }, g.uyeler.map((id) => {
            const s = servis.get(id);
            const yokOrtamlar = ortamlar.filter((o) => taslak.get(id).hucreler[o.id].mod === 'yok' && g.uyeler.some((u) => taslak.get(u).hucreler[o.id].mod !== 'yok'));
            const ayir = g.uyeler.length > 1 ? h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${s.ad}: gruptan ayır` }, 'Gruptan ayır') : null;
            ayir?.addEventListener('click', () => { gruptanAyir(id); ciz(); bildir(`${s.ad} gruptan ayrıldı: kendi özel adresine geçti (henüz kaydedilmedi).`); });
            return h('li', {},
              h('span', { class: 'taban-uye-adi' }, h('b', {}, s.ad), ' ', turRozeti(s)),
              h('span', { class: 'soluk kucuk' }, h('code', { class: 'duz' }, s.yol || '—'), ` · ${s.senaryoSayisi} senaryo${s.akislar.length ? ` · ${s.akislar.length} akış` : ''}`),
              yokOrtamlar.length ? h('span', { class: 'kucuk taban-yok-notu' }, `${yokOrtamlar.map((o) => o.ad).join(', ')} ortamında yok`) : null,
              ayir);
          }))));
        return [satir, uyeListesi];
      })));
  };

  const gorunumSecimi = h('div', { class: 'segment taban-gorunum', role: 'radiogroup', 'aria-label': 'Taban adres görünümü' });
  const ciz = () => {
    yerlestir(gorunumSecimi, [['adres', 'Adrese göre (varsayılan)'], ['servis', 'Servis bazında']].map(([d, m]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': gorunum === d ? 'true' : 'false', 'aria-pressed': gorunum === d ? 'true' : 'false',
      onclick: () => { if (gorunum !== d) { gorunum = d; gorunumYaz(d); ciz(); } }
    }, m)));
    yerlestir(grupListesi, gruplar().map((g) => h('option', { value: g })));
    hepsi.checked = secili.size === satirlar.length;
    yerlestir(tabloKap, gorunum === 'servis' ? servisTablosu() : adresTablosu(),
      ortamlar.map((o) => h('datalist', { id: `${grupListesi.id}-${o.id}` }, o.tabanAdresleri.map((a) => h('option', { value: temiz(a) })))));
    yerlestir(etkiKap);
    durumGuncelle();
  };

  // --- Toplu işlemler -------------------------------------------------------------------------------------------------
  const ortamSecimi = (etiket, tumu) => h('select', { 'aria-label': etiket }, tumu ? h('option', { value: '' }, 'Tüm ortamlar') : null, ortamlar.map((o) => h('option', { value: o.id }, o.ad)));
  const hedefServisler = () => (secili.size ? satirlar.filter((s) => secili.has(s.servisId)) : satirlar);

  const bulOrtam = ortamSecimi('Bul-değiştir ortamı', true);
  const bul = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'eski.ornek.com' });
  const yeni = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'yeni.ornek.com' });
  const degistir = h('button', { type: 'button' }, 'Değiştir');
  degistir.addEventListener('click', () => {
    mesaj.temizle();
    if (!bul.value) { mesaj.goster('Aranacak metni yazın.'); return; }
    let n = 0;
    for (const s of hedefServisler()) {
      for (const o of ortamlar) {
        if (bulOrtam.value && o.id !== bulOrtam.value) continue;
        const x = taslak.get(s.servisId).hucreler[o.id];
        // Ortamın adresini kullanan hücre de değişirse özel adrese döner (ortamın kendi adresi Ortamlar'dan değiştirilir).
        const mevcut = x.mod === 'servis' ? x.deger : x.mod === 'ortam' ? temiz(o.tabanUrl) : '';
        if (!mevcut.includes(bul.value)) continue;
        hucreAta(s.servisId, o.id, { mod: 'servis', deger: mevcut.split(bul.value).join(yeni.value) });
        n++;
      }
    }
    ciz();
    bildir(n ? `${n} hücrede değiştirildi (henüz kaydedilmedi).` : 'Eşleşen adres yok.');
  });

  const atamaOrtami = ortamSecimi('Atanacak ortam', false);
  const atamaModu = h('select', { 'aria-label': 'Atanacak adres türü' }, Object.entries(MOD_ETIKETI).map(([m, e]) => h('option', { value: m, selected: m === 'servis' }, e)));
  const atamaAdresi = h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://' });
  atamaModu.addEventListener('change', () => { atamaAdresi.hidden = atamaModu.value !== 'servis'; });
  const ata = h('button', { type: 'button' }, 'Seçilenlere ata');
  ata.addEventListener('click', () => {
    mesaj.temizle();
    if (!secili.size) { mesaj.goster('Önce tablodan servis seçin.'); return; }
    if (atamaModu.value === 'servis' && !adresGecerliMi(atamaAdresi.value.trim())) { mesaj.goster('Geçerli bir http(s) adresi yazın.'); return; }
    for (const id of secili) hucreAta(id, atamaOrtami.value, { mod: atamaModu.value, deger: atamaModu.value === 'servis' ? atamaAdresi.value.trim() : '' });
    ciz();
  });
  const grupAdi = h('input', { type: 'text', autocomplete: 'off', maxlength: '60', placeholder: 'ör. Çekirdek servisler' });
  grupAdi.setAttribute('list', grupListesi.id);
  const bagla = h('button', { type: 'button' }, 'Seçilenleri bu ada bağla');
  bagla.addEventListener('click', () => {
    mesaj.temizle();
    if (!secili.size) { mesaj.goster('Önce tablodan servis seçin.'); return; }
    const ad = grupAdi.value.trim();
    const ilk = [...secili][0];
    // Seçilenler aynı adreslere geçer: adın mevcut üyesi varsa onunkiler, yoksa ilk seçilen servisinkiler.
    const kaynak = [...taslak.entries()].find(([id, x]) => ad && x.grup === ad && !secili.has(id))?.[1] ?? taslak.get(ilk);
    const hucreler = JSON.parse(JSON.stringify(kaynak.hucreler));
    for (const id of secili) {
      const t = taslak.get(id);
      t.grup = ad;
      if (ad) for (const o of ortamlar) if (t.hucreler[o.id].mod !== 'eski' && hucreler[o.id].mod !== 'eski') t.hucreler[o.id] = { ...hucreler[o.id] };
    }
    ciz();
  });

  // --- Etki önizlemesi ve kayıt ---------------------------------------------------------------------------------------
  const etkiGoster = h('button', { type: 'button', class: 'birincil' }, ikon('liste'), 'Etkiyi göster');
  const geriAl = h('button', { type: 'button' }, 'Değişiklikleri geri al');
  geriAl.addEventListener('click', () => { for (const s of satirlar) taslak.set(s.servisId, JSON.parse(JSON.stringify(ozgun.get(s.servisId)))); ayrik.clear(); ciz(); });
  const hucreMetni = (x) => (x.kaynak === 'yok' ? 'bu ortamda yok' : x.kaynak === 'ortam' ? `${x.deger} (ortamın adresi)` : x.deger);
  etkiGoster.addEventListener('click', async () => {
    mesaj.temizle();
    const d = degisiklikler();
    for (const [id, x] of Object.entries(d)) {
      for (const [, a] of Object.entries(x.tabanlar || {})) {
        if (a && !adresGecerliMi(a)) { mesaj.goster(`${satirlar.find((s) => s.servisId === id).ad}: "${a}" geçerli bir http(s) adresi değil.`); return; }
      }
    }
    try {
      const { onizleme: e } = await mesgulIken(etkiGoster, 'Hesaplanıyor…', () => api('/platform/servis-tabanlari/uygula', { govde: { projeId: proje.id, degisiklikler: d } }));
      const kaydet = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Onayla ve kaydet');
      const vazgec = h('button', { type: 'button' }, 'Vazgeç');
      vazgec.addEventListener('click', () => yerlestir(etkiKap));
      kaydet.addEventListener('click', async () => {
        try {
          await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis-tabanlari/uygula', { govde: { projeId: proje.id, degisiklikler: d, onay: true } }));
          bildir(`${e.toplam.servis} servisin taban adresi güncellendi.`);
          await yukle(kap, proje);
        } catch (h2) { mesaj.goster(h2.message); }
      });
      yerlestir(etkiKap, h('div', { class: 'kart', role: 'region', 'aria-label': 'Değişikliğin etkisi' },
        h('div', { class: 'not-kutusu uyari', role: 'alert' },
          `Bu değişiklik ${e.toplam.servis} servisin ${e.toplam.senaryo} senaryosunu${e.toplam.akis ? ` ve ${e.toplam.akis} akışı` : ''} etkileyecek: sonraki koşular yeni adreslere gider. Onaylamadan hiçbir şey kaydedilmez.`),
        h('ul', { class: 'onay-listesi' }, e.servisler.map((s) => h('li', {}, h('b', {}, s.ad), ` — ${s.senaryoSayisi} senaryo`, s.akislar.length ? ` · akışlar: ${s.akislar.join(', ')}` : '',
          s.grup.eski !== s.grup.yeni ? h('div', { class: 'kucuk' }, `Taban adres adı: ${s.grup.eski || 'yok'} → ${s.grup.yeni || 'yok'}`) : null,
          h('ul', {}, s.adresler.map((a) => h('li', { class: 'kucuk' }, h('b', {}, `${a.ortam}: `), h('code', { class: 'duz' }, hucreMetni(a.eski)), ' → ', h('code', { class: 'duz' }, hucreMetni(a.yeni)))))))),
        h('p', { class: 'soluk kucuk' }, 'Erişim kontrolü yapılmaz (dış istek atılmaz); SOAP servisinde isterseniz servis sayfasından kontrol edin.'),
        h('div', { class: 'dugmeler' }, kaydet, vazgec)));
      kaydet.focus();
    } catch (h2) { mesaj.goster(h2.message); }
  });

  yerlestir(kap, baslik,
    h('p', { class: 'soluk kucuk' }, 'Her servisin ortam başına adresinin başı (yol servis ayarında kalır). Adrese göre görünümde aynı adresleri kullanan servisler tek satırdadır: bir hücre değişince satırdaki tüm servisler birlikte değişir ("Bu ortamda yok" olan servis o ortamda yok kalır). Değişiklikler önce etki önizlemesinde gösterilir; onaylamadan kaydedilmez.'),
    h('div', { class: 'satir-duzen taban-gorunum-satiri' }, h('span', { class: 'soluk kucuk' }, 'Görünüm'), gorunumSecimi),
    mesaj.kutu, grupListesi,
    h('details', { class: 'taban-toplu' }, h('summary', {}, 'Toplu düzenle (seçili satırlar; seçim yoksa tümü)'),
      h('fieldset', {}, h('legend', {}, 'Bul ve değiştir'), h('div', { class: 'satir-duzen' }, alan('Ortam', bulOrtam), alan('Bul', bul), alan('Yerine', yeni), degistir)),
      h('fieldset', {}, h('legend', {}, 'Seçilenlere adres ata'), h('div', { class: 'satir-duzen' }, alan('Ortam', atamaOrtami), alan('Adres türü', atamaModu), alan('Adres', atamaAdresi), ata)),
      h('fieldset', {}, h('legend', {}, 'Taban adres adı'), h('div', { class: 'satir-duzen' }, alan('Ad', grupAdi, { yardim: 'Boş bırakılırsa seçilenlerin adı kaldırılır.' }), bagla))),
    tabloKap,
    h('div', { class: 'dugmeler' }, etkiGoster, geriAl, durumMetni),
    etkiKap);
  ciz();
}
