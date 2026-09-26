// "Servis ekle" sihirbazı (Servisler > Servis ekle > Adım adım). Adımlar:
//   1 · Adresler   — servis adı; her ortam için taban adres (ortamın listesinden seç ya da yeni yaz; CANLI boş bırakılabilir).
//                    Tam adres yapıştırılırsa taban + yol kendiliğinden ayrılır.
//   2 · Metotlar   — yol + "Denetle" (TEST'e WSDL isteği, onayla) → metotlar; seçim + "CANLI'da çağrılmasın" işareti.
//   3 · Parametreler — seçilen metotların alanları; her alan için varsayılan değer kaynağı (öneriler hazır gelir).
//   4 · Giriş bilgisi — kullanılan giriş parametreleri için profil seç / oluştur / yok.
//   5 · Özet → Kaydet. Yeni yazılan taban adresler ortamlara kaydedilir (sonraki servislerde listede hazır olur).
// Hiçbir ağ isteği kullanıcı onayı olmadan atılmaz; kaydetmeden önce hiçbir şey veritabanına yazılmaz.
import { alan, api, bildir, h, ikon, mesajKutusu, mesgulIken, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { onayIste } from './kosu-paneli.js';
import { alanSatirlari } from './servis-govdesi.mjs';

const ADIMLAR = ['Adresler', 'Metotlar', 'Parametreler', 'Giriş bilgisi', 'Özet'];
const TIP = { metin: 'metin', tamsayi: 'sayı', ondalik: 'ondalık', mantiksal: 'evet/hayır', tarih: 'tarih', tarihSaat: 'tarih-saat' };
/** Kayıt oluşturan / belge üreten metot adları: "CANLI'da çağrılmasın" işaretli gelir (kullanıcı değiştirebilir). */
const YALNIZ_TEST_DESENI = /approve|onay|print|basim|cancel|iptal|delete|sil|create|kaydet|save|pay|odeme|purchase|policy|police/i;
/** Giriş bilgisi sayılan alan adları → parametre. */
const KIMLIK_ALANLARI = { username: 'USERNAME', user: 'USERNAME', kullaniciadi: 'USERNAME', password: 'PASSWORD', pass: 'PASSWORD', parola: 'PASSWORD', sifre: 'PASSWORD', channel: 'CHANNEL', kanal: 'CHANNEL' };
const TARIH_BICIMI = { tarih: 'yyyy-MM-dd', tarihSaat: "yyyy-MM-dd'T'HH:mm:ss" };

const temizTaban = (a) => a.trim().replace(/\/+$/, '');
const birlestir = (taban, yol) => `${temizTaban(taban)}/${yol.replace(/^\/+/, '')}`;

function anahtarUret(ad) {
  return ad.trim().replace(/(?:Soap12|Soap)$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/**
 * @param {HTMLElement} kap
 * @param {{ id: string; ad: string }} proje
 * @param {Array<{ id: string; ad: string; canli: boolean; varsayilan: boolean; tabanUrl: string; tabanAdresleri?: string[] }>} ortamlar
 */
export async function servisSihirbazi(kap, proje, tumOrtamlar) {
  // TEST ortamları önce (denetleme ve ilk adres oradan), CANLI sonra.
  const ortamlar = [...tumOrtamlar].sort((a, b) => Number(a.canli) - Number(b.canli));
  const [{ servisler }, { turler }, { profiller: kimlikProfilleri }] = await Promise.all([
    api(`/platform/servisler?projeId=${encodeURIComponent(proje.id)}`),
    api(`/platform/test-verisi-turleri?projeId=${encodeURIComponent(proje.id)}`),
    api(`/platform/servis-kimlikleri?projeId=${encodeURIComponent(proje.id)}`)
  ]);
  const testOrtamlari = ortamlar.filter((o) => !o.canli);
  /** Sihirbaz durumu (kaydedene kadar yalnız tarayıcıda). */
  const d = {
    adim: 0, ad: '', anahtar: '', anahtarElle: false, soapSurumu: '1.1', tls: true,
    tabanlar: Object.fromEntries(ortamlar.map((o) => [o.id, o.canli ? '' : o.tabanUrl])),
    yol: '', kontrolOrtami: (testOrtamlari.find((o) => o.varsayilan) || testOrtamlari[0])?.id ?? '',
    erisim: null, secilen: new Set(), yalnizTest: new Set(), varsayilanlar: {}, zorunlu: {}, profil: { tur: 'yok', ad: '', degerler: {} }
  };

  // Parametre seçenekleri (3. adım): giriş bilgisi, tarih kuralı (sihirbaz önerir), test verisi eşlemeleri.
  const veriParametreleri = turler.flatMap((t) => t.alanlar.flatMap((a) => (a.servisParametreleri || []).map((sp) => [sp.ad, `${sp.ad} — ${t.ad}.${a.etiket || a.ad} (${sp.rol})`])));
  const kimlikParametreleri = [...new Set(['USERNAME', 'PASSWORD', 'CHANNEL', ...kimlikProfilleri.flatMap((p) => p.alanlar)])];
  // Diğer servislerde ★ yapılmış alan → parametre eşlemeleri (ör. CitizenshipNumber → SIGORTALI_TC): öneri olarak kullanılır.
  const ogrenilen = {};
  for (const s of servisler) {
    for (const alanlar of Object.values(s.ayarlar.alanVarsayilanlari || {})) {
      for (const [yol, v] of Object.entries(alanlar)) if (v.kaynak === 'parametre' && v.deger) ogrenilen[yol.split('/').pop()] ??= v.deger;
    }
  }
  const oneri = (alanT) => {
    const ad = alanT.ad.toLowerCase().replace(/[^a-z]/g, '');
    if (KIMLIK_ALANLARI[ad]) return KIMLIK_ALANLARI[ad];
    if (alanT.tip === 'tarih' || alanT.tip === 'tarihSaat') {
      if (/begin|start|baslangic/.test(ad)) return 'BEGIN_DATE';
      if (/end|bitis/.test(ad)) return 'END_DATE';
    }
    return ogrenilen[alanT.ad] ?? '';
  };

  const mesaj = mesajKutusu();
  const govde = h('div', {});
  const adimCubugu = h('ol', { class: 'sihirbaz-adimlari', 'aria-label': 'Adımlar' });
  const geri = h('button', { type: 'button' }, 'Geri');
  const ileri = h('button', { type: 'button', class: 'birincil' }, 'İleri');
  const nedenMetni = h('span', { class: 'soluk kucuk', 'aria-live': 'polite' });
  geri.addEventListener('click', () => { if (d.adim > 0) { d.adim--; ciz(); } });

  const ortamSatiri = (o) => {
    const liste = [...new Set((o.tabanAdresleri && o.tabanAdresleri.length ? o.tabanAdresleri : [o.tabanUrl]).map(temizTaban))];
    const sec = h('select', { 'aria-label': `${o.ad} taban adresi` },
      ...liste.map((a) => h('option', { value: a, selected: temizTaban(d.tabanlar[o.id] || '') === a }, a)),
      h('option', { value: '__yeni', selected: Boolean(d.tabanlar[o.id]) && !liste.includes(temizTaban(d.tabanlar[o.id])) }, 'Yeni adres yaz…'),
      o.canli ? h('option', { value: '', selected: d.tabanlar[o.id] === '' }, '— Bu ortamda yok (yalnız TEST) —') : null);
    const yeni = h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://ornek.com/', 'aria-label': `${o.ad} yeni taban adresi`,
      value: sec.value === '__yeni' ? d.tabanlar[o.id] : '', hidden: sec.value !== '__yeni' });
    sec.addEventListener('change', () => {
      yeni.hidden = sec.value !== '__yeni';
      d.tabanlar[o.id] = sec.value === '__yeni' ? yeni.value.trim() : sec.value;
      if (!yeni.hidden) yeni.focus();
      d.erisim = null;
      durumGuncelle();
    });
    yeni.addEventListener('input', () => { d.tabanlar[o.id] = yeni.value.trim(); d.erisim = null; durumGuncelle(); });
    return h('div', { class: 'taban-satiri' }, h('span', { class: 'taban-ortam' }, o.ad, ' ', rozet(o.canli ? 'CANLI' : 'TEST', o.canli ? 'hata' : '')), sec, yeni);
  };

  // --- Adım çizimleri --------------------------------------------------------------------------------------------------
  const adim1 = () => {
    const ad = h('input', { type: 'text', autocomplete: 'off', value: d.ad, placeholder: 'ör. TravelService' });
    const anahtar = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: d.anahtar, placeholder: 'ör. travel-service' });
    ad.addEventListener('input', () => { d.ad = ad.value; if (!d.anahtarElle) { d.anahtar = anahtarUret(ad.value); anahtar.value = d.anahtar; } durumGuncelle(); });
    anahtar.addEventListener('input', () => { d.anahtar = anahtar.value.trim(); d.anahtarElle = Boolean(anahtar.value); durumGuncelle(); });
    // Tam adres yapıştır: bilinen bir taban adresiyle başlıyorsa taban + yol ayrılır, değilse adresin kökü yeni taban olur.
    const yapistir = h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://ornek.com/servisler/ahmet.asmx', 'aria-label': 'Servisin tam adresi (TEST)' });
    const yapistirNotu = h('span', { class: 'soluk kucuk', 'aria-live': 'polite' });
    yapistir.addEventListener('change', () => {
      let u;
      try { u = new URL(yapistir.value.trim().replace(/\?wsdl$/i, '')); } catch { yapistirNotu.textContent = 'Adres anlaşılamadı (http:// ya da https:// ile başlamalı).'; return; }
      const tam = u.href.replace(/\/$/, '');
      const test = ortamlar.find((o) => o.id === d.kontrolOrtami) || testOrtamlari[0];
      const adaylar = test ? [...new Set((test.tabanAdresleri || [test.tabanUrl]).map(temizTaban))] : [];
      const taban = adaylar.filter((a) => tam.toLowerCase().startsWith(a.toLowerCase() + '/')).sort((a, b) => b.length - a.length)[0] || u.origin;
      if (test) d.tabanlar[test.id] = taban;
      d.yol = tam.slice(taban.length) || '/';
      d.erisim = null;
      yapistirNotu.textContent = `Taban: ${taban} · Yol: ${d.yol} (${adaylar.includes(taban) ? 'kayıtlı taban adres' : 'yeni taban adres; kaydedilince ortama eklenir'})`;
      ciz();
    });
    const surum = h('select', { 'aria-label': 'SOAP sürümü' }, ['1.1', '1.2'].map((v) => h('option', { value: v, selected: d.soapSurumu === v }, `SOAP ${v}`)));
    surum.addEventListener('change', () => { d.soapSurumu = surum.value; });
    const tls = h('input', { type: 'checkbox', id: yeniKimlik('tls'), checked: d.tls });
    tls.addEventListener('change', () => { d.tls = tls.checked; d.erisim = null; });
    return [
      alan('Servis adı', ad, { zorunlu: true }), alan('Anahtar', anahtar, { yardim: 'Küçük harf, rakam ve "-". Addan önerilir.' }),
      h('fieldset', {}, h('legend', {}, 'Taban adresler (adresin başı)'),
        h('p', { class: 'soluk kucuk' }, 'Her ortam için servisin adresinin başını seçin ya da yazın. Yeni yazılan adres ortama kaydedilir; sonraki servislerde listede hazır olur. Yol bir sonraki adımda.'),
        ...ortamlar.map(ortamSatiri),
        h('details', { class: 'yapistir' }, h('summary', {}, 'Tam adresi biliyorum (yapıştır, ayrılsın)'), alan('Servisin TEST adresi', yapistir), yapistirNotu)),
      h('div', { class: 'satir-duzen' }, alan('SOAP sürümü', surum), h('label', { class: 'secenek', for: tls.id }, tls, 'TLS sertifikasını doğrula (iç ortam sertifikası tanınmıyorsa kapatın)'))
    ];
  };

  const adim2 = () => {
    const yol = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: d.yol, placeholder: '/AppService/travel.asmx', 'aria-label': 'Yol' });
    const onizleme = h('ul', { class: 'adres-onizleme' });
    const onizle = () => yerlestir(onizleme, ...ortamlar.map((o) => h('li', {}, h('b', {}, `${o.ad}: `),
      d.tabanlar[o.id] ? h('code', { class: 'duz' }, birlestir(d.tabanlar[o.id], d.yol || '/…')) : h('span', { class: 'soluk' }, 'bu ortamda yok'))));
    yol.addEventListener('input', () => { d.yol = yol.value.trim(); d.erisim = null; onizle(); metotAlani(); durumGuncelle(); });
    onizle();
    const kontrolSec = h('select', { 'aria-label': 'Denetleme ortamı' }, testOrtamlari.map((o) => h('option', { value: o.id, selected: d.kontrolOrtami === o.id }, o.ad)));
    kontrolSec.addEventListener('change', () => { d.kontrolOrtami = kontrolSec.value; d.erisim = null; metotAlani(); durumGuncelle(); });
    const denetle = h('button', { type: 'button' }, ikon('ag'), 'Denetle');
    const sonuc = h('div', { 'aria-live': 'polite' });
    const metotAlani = () => {
      if (!d.erisim) { yerlestir(sonuc); return; }
      const hepsi = h('input', { type: 'checkbox', id: yeniKimlik('hepsi'), checked: d.erisim.operasyonlar.every((o) => d.secilen.has(o.ad)) });
      hepsi.addEventListener('change', () => { for (const o of d.erisim.operasyonlar) hepsi.checked ? d.secilen.add(o.ad) : d.secilen.delete(o.ad); metotAlani(); durumGuncelle(); });
      yerlestir(sonuc,
        h('div', { class: 'not-kutusu basari', role: 'status' }, ikon('onay'), ` Erişildi (${d.erisim.durumKodu}, ${d.erisim.sureMs} ms): ${d.erisim.operasyonlar.length} metot.`),
        h('div', { class: 'metot-listesi', role: 'table', 'aria-label': 'Metotlar' },
          h('div', { class: 'metot-satiri baslik', role: 'row' }, h('label', { class: 'secenek', for: hepsi.id }, hepsi, 'Hepsini seç'), h('span', { role: 'columnheader' }, 'Alan'), h('span', { role: 'columnheader' }, 'CANLI\'da çağrılmasın')),
          ...d.erisim.operasyonlar.map((o) => {
            const sec = h('input', { type: 'checkbox', id: yeniKimlik('op'), checked: d.secilen.has(o.ad) });
            const yt = h('input', { type: 'checkbox', id: yeniKimlik('yt'), checked: d.yalnizTest.has(o.ad), 'aria-label': `${o.ad} CANLI'da çağrılmasın` });
            sec.addEventListener('change', () => { sec.checked ? d.secilen.add(o.ad) : d.secilen.delete(o.ad); hepsi.checked = d.erisim.operasyonlar.every((x) => d.secilen.has(x.ad)); durumGuncelle(); });
            yt.addEventListener('change', () => { yt.checked ? d.yalnizTest.add(o.ad) : d.yalnizTest.delete(o.ad); });
            const sema = d.erisim.semalar?.[o.ad];
            return h('div', { class: 'metot-satiri', role: 'row' }, h('label', { class: 'secenek', for: sec.id }, sec, h('code', { class: 'duz' }, o.ad)),
              h('span', { class: 'soluk kucuk' }, sema ? `${alanSatirlari(sema.alanlar).filter((x) => !x.grup).length} alan` : 'alan listesi yok'), yt);
          })));
    };
    denetle.addEventListener('click', async () => {
      mesaj.temizle();
      if (!/^\/\S*$/.test(d.yol)) { mesaj.goster('Yol "/" ile başlamalı (ör. /AppService/travel.asmx).'); return; }
      const o = testOrtamlari.find((x) => x.id === d.kontrolOrtami);
      if (!o || !d.tabanlar[o.id]) { mesaj.goster('Denetleme için TEST ortamının taban adresi gerekli (1. adım).'); return; }
      const adres = `${birlestir(d.tabanlar[o.id], d.yol)}?wsdl`;
      if (!(await onayIste({ baslik: 'TEST ortamına istek atılsın mı?', metin: `Servisin WSDL'i istenecek (yalnız okuma): ${adres}`, dugme: 'İstek at', ikonAd: 'ag' }))) return;
      await mesgulIken(denetle, 'Denetleniyor…', async () => {
        try {
          const e = await api('/platform/servis/erisim', { govde: { projeId: proje.id, ortamId: o.id, yol: d.yol, tabanlar: { [o.id]: d.tabanlar[o.id] }, ...(d.tls ? {} : { tlsDogrulama: false }) } });
          if (!e.erisilebilir) { d.erisim = null; yerlestir(sonuc, h('div', { class: 'not-kutusu hata', role: 'alert' }, `Erişilemedi: ${e.mesaj}`, h('br', {}), h('code', { class: 'duz' }, e.adres))); durumGuncelle(); return; }
          d.erisim = e;
          d.secilen = new Set(e.operasyonlar.map((x) => x.ad));
          d.yalnizTest = new Set(e.operasyonlar.filter((x) => YALNIZ_TEST_DESENI.test(x.ad)).map((x) => x.ad));
          d.varsayilanlar = {};
          d.zorunlu = {};
          metotAlani();
        } catch (hata) { yerlestir(sonuc, h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message)); }
        durumGuncelle();
      });
    });
    metotAlani();
    return [
      alan('Yol', yol, { zorunlu: true, yardim: 'Taban adresin arkasına eklenir; tüm ortamlarda aynıdır.' }),
      h('div', {}, h('div', { class: 'alan-etiketi' }, 'Gidilecek adresler'), onizleme),
      h('div', { class: 'satir-duzen' }, alan('Denetleme ortamı', kontrolSec, { yardim: 'Denetleme yalnız TEST ortamında yapılır.' }), denetle),
      sonuc
    ];
  };

  const adim3 = () => {
    const secenekler = [
      ['Giriş bilgisi', kimlikParametreleri.map((a) => [a, `${a} — giriş profili`])],
      ['Tarih kuralı', [['BEGIN_DATE', 'BEGIN_DATE — bugün'], ['END_DATE', 'END_DATE — bugün + 1 yıl']]],
      ['Test verisi', veriParametreleri]
    ].filter(([, l]) => l.length);
    const bolumler = [];
    for (const ad of d.secilen) {
      const sema = d.erisim.semalar?.[ad];
      if (!sema || !sema.alanlar.length) { bolumler.push(h('p', { class: 'soluk' }, h('code', { class: 'duz' }, ad), ': alan listesi yok (senaryoları XML olarak düzenlenir).')); continue; }
      const v = (d.varsayilanlar[ad] ??= Object.fromEntries(alanSatirlari(sema.alanlar).filter((x) => !x.grup).map((x) => [x.yol, oneri(x.alan)])));
      // Zorunluluk: WSDL'e göre işaretli gelir (şemada zorunlu), kullanıcı iş kuralına göre düzeltir.
      const z = (d.zorunlu[ad] ??= new Set(alanSatirlari(sema.alanlar).filter((x) => !x.grup && x.alan.zorunlu).map((x) => x.yol)));
      const sayac = h('span', { class: 'soluk' });
      const sayacGuncelle = () => { sayac.textContent = ` · ${z.size} zorunlu`; };
      sayacGuncelle();
      const satirlar = alanSatirlari(sema.alanlar).map((s) => {
        if (s.grup) return h('div', { class: `alan-grubu derinlik-${Math.min(s.derinlik, 6)}` }, s.alan.ad);
        const sec = h('select', { 'aria-label': `${ad} ${s.yol} varsayılanı` }, h('option', { value: '' }, '— yok (senaryoda doldurulur) —'),
          ...secenekler.map(([g, l]) => h('optgroup', { label: g }, l.map(([p, m]) => h('option', { value: p, selected: v[s.yol] === p }, m)))),
          v[s.yol] && !secenekler.some(([, l]) => l.some(([p]) => p === v[s.yol])) ? h('option', { value: v[s.yol], selected: true }, v[s.yol]) : null);
        sec.addEventListener('change', () => { v[s.yol] = sec.value; });
        const zk = h('input', { type: 'checkbox', checked: z.has(s.yol), 'aria-label': `${ad} ${s.yol} zorunlu`, title: s.alan.zorunlu ? 'WSDL\'de zorunlu (minOccurs=1)' : 'WSDL\'de isteğe bağlı' });
        const satir = h('div', { class: `alan-satiri derinlik-${Math.min(s.derinlik, 6)} ${v[s.yol] ? '' : 'gonderilmez'} ${z.has(s.yol) ? 'zorunlu' : ''}` },
          h('span', { class: 'alan-adi', title: s.yol }, s.alan.ad, h('span', { class: 'alan-tipi' }, s.alan.secenekler ? 'liste' : TIP[s.alan.tip] || 'metin')),
          sec, h('span', { class: 'zorunlu-hucre' }, zk));
        zk.addEventListener('change', () => { zk.checked ? z.add(s.yol) : z.delete(s.yol); satir.classList.toggle('zorunlu', zk.checked); sayacGuncelle(); });
        return satir;
      });
      const alanSayisi = satirlar.filter((x) => x.classList.contains('alan-satiri')).length;
      bolumler.push(h('details', { open: d.secilen.size <= 2 }, h('summary', {}, h('code', { class: 'duz' }, ad), ` — ${alanSayisi} alan`, sayac),
        h('div', { class: 'alan-formu sihirbaz-alanlari' },
          h('div', { class: 'alan-satiri baslik' }, h('span', {}, 'Alan'), h('span', {}, 'Varsayılan değer'), h('span', { class: 'zorunlu-hucre' }, 'Zorunlu')),
          ...satirlar)));
    }
    return [
      h('p', { class: 'soluk' }, 'Seçilen metotların alanları. Her alan için varsayılan değer kaynağı seçebilirsiniz; yeni senaryolar bu alanlar dolu açılır (★ servis varsayılanı). Öneriler hazır geldi: giriş bilgisi, tarih ve daha önce başka serviste eşlenmiş alanlar. Boş bırakılanlar senaryoda doldurulur.'),
      h('p', { class: 'soluk kucuk' }, '"Zorunlu" işareti WSDL\'e göre gelir; iş kuralına göre düzeltin (WSDL\'de sayı ve evet/hayır alanları hep zorunlu, metinler hep isteğe bağlı görünebilir). Senaryo düzenleyicide zorunlu alanlar vurgulanır ve süzülebilir.'),
      ...bolumler
    ];
  };

  const kullanilanKimlikler = () => [...new Set(Object.values(d.varsayilanlar).flatMap((v) => Object.values(v)).filter((p) => kimlikParametreleri.includes(p)))];
  const adim4 = () => {
    const kullanilan = kullanilanKimlikler();
    if (!kullanilan.length && d.profil.tur !== 'mevcut') d.profil.tur = 'yok';
    const tur = h('select', { 'aria-label': 'Giriş bilgisi' },
      h('option', { value: 'yok', selected: d.profil.tur === 'yok' }, 'Giriş bilgisi yok'),
      kimlikProfilleri.length ? h('option', { value: 'mevcut', selected: d.profil.tur === 'mevcut' }, 'Kayıtlı profili kullan') : null,
      h('option', { value: 'yeni', selected: d.profil.tur === 'yeni' }, 'Yeni profil oluştur'));
    const alanlar = h('div', {});
    const alanCiz = () => {
      if (d.profil.tur === 'mevcut') {
        const sec = h('select', { 'aria-label': 'Profil' }, kimlikProfilleri.map((p) => h('option', { value: p.ad, selected: d.profil.ad === p.ad }, `${p.ad} (${p.alanlar.join(', ')})`)));
        if (!d.profil.ad) d.profil.ad = kimlikProfilleri[0]?.ad ?? '';
        const eksikNotu = h('div', { 'aria-live': 'polite' });
        const eksikCiz = () => {
          const p = kimlikProfilleri.find((x) => x.ad === d.profil.ad);
          const eksik = p ? kullanilan.filter((a) => !p.alanlar.includes(a)) : [];
          yerlestir(eksikNotu, eksik.length ? h('div', { class: 'not-kutusu uyari', role: 'status' },
            `"${p.ad}" profilinde ${eksik.join(', ')} yok; bu alanlar senaryoda değer bulamaz. `,
            h('a', { href: '#/ayarlar/servis-girisleri', target: '_blank', rel: 'noopener' }, 'Ayarlar > Servis giriş bilgileri'), ' bölümünden ekleyin ya da "Yeni profil oluştur"u seçin.') : null);
        };
        sec.addEventListener('change', () => { d.profil.ad = sec.value; eksikCiz(); durumGuncelle(); });
        eksikCiz();
        yerlestir(alanlar, alan('Profil', sec), eksikNotu,
          h('p', { class: 'soluk kucuk' }, 'Profiller Ayarlar > Servis giriş bilgileri bölümünden eklenir, düzenlenir ve silinir.'));
      } else if (d.profil.tur === 'yeni') {
        const ad = h('input', { type: 'text', autocomplete: 'off', value: d.profil.ad, placeholder: 'ör. Kanal 100' });
        ad.addEventListener('input', () => { d.profil.ad = ad.value.trim(); durumGuncelle(); });
        const girdiler = (kullanilan.length ? kullanilan : ['USERNAME', 'PASSWORD', 'CHANNEL']).map((p) => {
          const g = h('input', { type: p === 'PASSWORD' ? 'password' : 'text', autocomplete: p === 'PASSWORD' ? 'new-password' : 'off', spellcheck: 'false', 'aria-label': p, value: d.profil.degerler[p] || '' });
          g.addEventListener('input', () => { d.profil.degerler[p] = g.value; });
          return alan(p, g);
        });
        yerlestir(alanlar, alan('Profil adı', ad, { zorunlu: true }), ...girdiler,
          h('p', { class: 'soluk kucuk' }, 'Değerler kasada şifreli saklanır, bir daha gösterilmez. CANLI\'da farklıysa sonra servisin Parametreler sekmesinden ortama özel değer girilir.'));
      } else yerlestir(alanlar);
    };
    tur.addEventListener('change', () => { d.profil.tur = tur.value; alanCiz(); durumGuncelle(); });
    alanCiz();
    return [
      h('p', { class: 'soluk' }, kullanilan.length ? `Bu servis şu giriş parametrelerini kullanıyor: ${kullanilan.join(', ')}.` : 'Parametre adımında giriş bilgisi seçilmedi; gerekmiyorsa "Giriş bilgisi yok" kalabilir.'),
      alan('Giriş bilgisi', tur), alanlar
    ];
  };

  const adim5 = () => {
    const tarihKurallari = tarihKuraliOnerileri();
    return [h('dl', { class: 'ozet-listesi' },
      h('dt', {}, 'Servis'), h('dd', {}, `${d.ad} (${d.anahtar})`),
      h('dt', {}, 'Adresler'), h('dd', {}, h('ul', {}, ortamlar.map((o) => h('li', {}, `${o.ad}: `, d.tabanlar[o.id] ? h('code', { class: 'duz' }, birlestir(d.tabanlar[o.id], d.yol)) : h('span', { class: 'soluk' }, 'yok (bu ortamda koşmaz)'))))),
      h('dt', {}, 'Metotlar'), h('dd', {}, [...d.secilen].map((m) => `${m}${d.yalnizTest.has(m) ? ' (CANLI\'da çağrılmaz)' : ''}`).join(', ')),
      h('dt', {}, 'Varsayılan alanlar'), h('dd', {}, `${Object.values(d.varsayilanlar).reduce((n, v) => n + Object.values(v).filter(Boolean).length, 0)} alan`),
      h('dt', {}, 'Zorunlu alanlar'), h('dd', {}, [...d.secilen].filter((m) => d.zorunlu[m]).map((m) => `${m}: ${d.zorunlu[m].size}`).join(' · ') || '—'),
      h('dt', {}, 'Tarih kuralları'), h('dd', {}, Object.entries(tarihKurallari).map(([a, k]) => `${a} = ${k}`).join(' · ') || 'yok'),
      h('dt', {}, 'Giriş bilgisi'), h('dd', {}, d.profil.tur === 'yok' ? 'yok' : `${d.profil.ad}${d.profil.tur === 'yeni' ? ' (yeni profil)' : ''}`))];
  };

  /** 3. adımda seçilen BEGIN_DATE / END_DATE için tarih kuralı (alan tipine göre biçim). */
  function tarihKuraliOnerileri() {
    const k = {};
    for (const [op, v] of Object.entries(d.varsayilanlar)) {
      const sema = d.erisim?.semalar?.[op];
      if (!sema) continue;
      for (const s of alanSatirlari(sema.alanlar)) {
        const p = v[s.yol];
        if (p !== 'BEGIN_DATE' && p !== 'END_DATE') continue;
        const bicim = TARIH_BICIMI[s.alan.tip] || TARIH_BICIMI.tarihSaat;
        k[p] ??= p === 'BEGIN_DATE' ? `bugun|${bicim}` : `bugun+1y|${bicim}`;
      }
    }
    return k;
  }

  /** Adımdan ileri geçilemiyorsa nedeni (null = geçilebilir). */
  const eksik = () => {
    if (d.adim === 0) {
      if (!d.ad.trim()) return 'Servis adını yazın.';
      if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(d.anahtar)) return 'Anahtar yalnız küçük harf, rakam ve "-" içerebilir.';
      if (!testOrtamlari.some((o) => d.tabanlar[o.id])) return 'En az bir TEST ortamı için taban adres gerekli.';
      for (const o of ortamlar) { const a = d.tabanlar[o.id]; if (a && !/^https?:\/\/\S+$/.test(a)) return `${o.ad} taban adresi http:// ya da https:// ile başlamalı.`; }
      if (servisler.some((s) => s.anahtar === d.anahtar)) return `"${d.anahtar}" anahtarlı servis zaten var.`;
    }
    if (d.adim === 1) {
      if (!d.erisim) return 'Yolu yazıp "Denetle" ile erişimi kontrol edin.';
      if (!d.secilen.size) return 'En az bir metot seçin.';
    }
    if (d.adim === 3 && d.profil.tur !== 'yok' && !d.profil.ad) return 'Profil adı gerekli.';
    return null;
  };
  const durumGuncelle = () => {
    const n = eksik();
    ileri.disabled = Boolean(n);
    nedenMetni.textContent = n || '';
  };

  ileri.addEventListener('click', async () => {
    if (eksik()) return;
    if (d.adim < ADIMLAR.length - 1) { d.adim++; mesaj.temizle(); ciz(); return; }
    mesaj.temizle();
    try {
      await mesgulIken(ileri, 'Kaydediliyor…', async () => {
        if (d.profil.tur === 'yeni') {
          const degerler = Object.fromEntries(Object.entries(d.profil.degerler).filter(([, v]) => v !== ''));
          if (Object.keys(degerler).length) await api('/platform/servis-kimligi/kaydet', { govde: { projeId: proje.id, ad: d.profil.ad, degerler } });
        }
        const alanVarsayilanlari = Object.fromEntries(Object.entries(d.varsayilanlar)
          .map(([op, v]) => [op, Object.fromEntries(Object.entries(v).filter(([, p]) => p).map(([yol, p]) => [yol, { kaynak: 'parametre', deger: p }]))])
          .filter(([, v]) => Object.keys(v).length));
        const r = await api('/platform/servis/kaydet', { govde: {
          projeId: proje.id, anahtar: d.anahtar, ad: d.ad.trim(), yol: d.yol, soapSurumu: d.soapSurumu, tlsDogrulama: d.tls,
          tabanlar: d.tabanlar, secilenOperasyonlar: [...d.secilen], yalnizTestOperasyonlari: [...d.yalnizTest].filter((x) => d.secilen.has(x)),
          alanVarsayilanlari, alanZorunluluklari: Object.fromEntries([...d.secilen].filter((m) => d.zorunlu[m]).map((m) => [m, [...d.zorunlu[m]]])),
          tarihKurallari: tarihKuraliOnerileri(), kimlikProfili: d.profil.tur === 'yok' ? '' : d.profil.ad, erisimKimligi: d.erisim.erisimKimligi
        } });
        bildir('Servis eklendi.');
        location.hash = `#/servisler/s/${encodeURIComponent(r.id)}`;
      });
    } catch (e) { mesaj.goster(e.message); }
  });

  const ciz = () => {
    yerlestir(adimCubugu, ...ADIMLAR.map((a, i) => h('li', { class: i === d.adim ? 'simdiki' : i < d.adim ? 'bitti' : '', 'aria-current': i === d.adim ? 'step' : null }, h('span', { class: 'adim-no' }, String(i + 1)), a)));
    yerlestir(govde, ...[adim1, adim2, adim3, adim4, adim5][d.adim]());
    geri.disabled = d.adim === 0;
    ileri.textContent = d.adim === ADIMLAR.length - 1 ? 'Kaydet' : 'İleri';
    durumGuncelle();
  };
  yerlestir(kap, h('div', { class: 'kart form-paneli sihirbaz' }, adimCubugu, mesaj.kutu, govde,
    h('div', { class: 'dugmeler' }, geri, ileri, nedenMetni)));
  ciz();
}
