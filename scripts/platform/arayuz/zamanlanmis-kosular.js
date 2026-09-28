// AYARLAR > KOŞU > ZAMANLANMIŞ KOŞULAR — Nöbetçi'nin belirli zamanlarda kendiliğinden koşu başlatması (kullanıcı kararı).
// Kurallar kasada şifreli saklanır (sunucu: scripts/platform/zamanlama/*.mjs). Bu ekran hiçbir koşu BAŞLATMAZ ("Şimdi koş" yok;
// elle koşu için Senaryolar > "Koşuyu başlat"). Kural listesi: sonraki çalışma, son çalışma + sonucu, etkin anahtarı, son 20 tetikleme.
// Kartın altındaki "Kasa kilitliyken ve açılışta" bölümü: A/B/C tercihleri (üçü de varsayılan KAPALI; her biri ayrı açılır, ne yaptığı
// ve riski yazılıdır). Kilitle düğmeleri kasayiKilitleSecimli() ile iki seçenek sunar (A ya da B açıkken).
import { alan, alanHatasi, api, bildir, bosDurum, h, ikon, mesajKutusu, mesgulIken, parolaAlani, rozet, tarihMetni, yeniKimlik, yerlestir } from './ortak.js';
import { onayIste } from './ekran-ortak.js';
import { ortamRiskRozeti, riskliOrtamMi } from './kosu-paneli.js';

const GUNLER = [[1, 'Pzt'], [2, 'Sal'], [3, 'Çar'], [4, 'Per'], [5, 'Cum'], [6, 'Cmt'], [7, 'Paz']];
const ARALIKLAR = [1, 2, 3, 4, 6, 8, 12];
const DURUM = {
  calisiyor: ['Çalışıyor', 'uyari'], tamamlandi: ['Başarılı', 'basari'], basarisiz: ['Kalan var', 'hata'],
  atlandi: ['Atlandı', 'durdu'], yarida: ['Yarıda kaldı', 'uyari'], hata: ['Başlatılamadı', 'hata']
};
const durumRozeti = (d) => { const [m, t] = DURUM[d] || [d, '']; return rozet(m, t); };
const ortamRiskli = (o) => riskliOrtamMi(o);
const KILAVUZ = 'Zamanlanmış koşular yalnız Nöbetçi açıkken (sunucu çalışırken) ve kasa AÇIKKEN çalışır (aşağıdaki "Kasa kilitliyken ve açılışta" tercihleriyle değiştirebilirsiniz); zamanlar bu bilgisayarın saatine göredir. '
  + 'Kasa kilitliyken ya da Nöbetçi kapalıyken kaçan zamanlar sonradan toplu koşulmaz; varsayılan olarak bir sonraki zaman beklenir. Otomatik kilit süresi '
  + '(Ayarlar > Güvenlik) dolunca kasa kilitlenir. Vakti geldiğinde başka bir koşu sürüyorsa o zaman varsayılan olarak atlanır ("Atlandı: koşu sürüyordu"). '
  + 'Bu iki davranışı aşağıdaki "Zamanlanmış koşu davranışı" bölümünden değiştirebilirsiniz. '
  + 'Koşular "Koşuyu başlat" ile aynı yoldan yapılır; sonuçlar Sonuçlar\'a düşer.';

/**
 * Ayarlar > Koşu içindeki "Zamanlanmış koşular" kartı.
 * @param {{ id: string; ad: string }} proje
 * @param {{ davranisFormu?: () => Promise<HTMLElement> }} [secenek] davranisFormu: kaçan / çakışan zaman kararları formu (ayarlar.js; tüm kurallar için)
 */
export async function zamanlanmisKosularKarti(proje, secenek = {}) {
  const kart = h('section', { class: 'kart form-paneli zamanlanmis-kosular', 'aria-label': 'Zamanlanmış koşular' });
  const ciz = async () => {
    const q = `projeId=${encodeURIComponent(proje.id)}`;
    const bos = (anahtar) => () => ({ [anahtar]: [] });
    const [veri, { ortamlar }, ekranYaniti, akisYaniti, entYaniti] = await Promise.all([
      api(`/platform/zamanlanmis-kosular?${q}`), api(`/platform/ortamlar?${q}`),
      api(`/platform/ekranlar?${q}`).catch(bos('ekranlar')), api(`/platform/servis-akislari?${q}`).catch(bos('akislar')),
      api(`/platform/entegrasyonlar?${q}`).catch(() => ({ turler: [], baglantilar: [] }))
    ]);
    const ekranlar = (ekranYaniti.ekranlar || []).filter((e) => e.modelTuru !== 'altModel');
    // Servis akışları ve uçtan uca akışlar (servis, ekran, SQL adımları) ayrı listelerde seçilir.
    const akislar = (akisYaniti.akislar || []).filter((a) => a.tur !== 'oturum' && !a.icerik?.uctanUca);
    const uctanUcalar = (akisYaniti.akislar || []).filter((a) => a.tur === 'akis' && a.icerik?.uctanUca);
    const bildirimTurleri = new Set((entYaniti.turler || []).filter((t) => (t.olaylar || []).some((o) => o.ad === 'kosu-bitti')).map((t) => t.tur));
    const webhooklar = (entYaniti.baglantilar || []).filter((b) => bildirimTurleri.has(b.tur));
    const secenekler = { proje, ortamlar, ekranlar, akislar, uctanUcalar, webhooklar };
    const formAlani = h('div', { class: 'zamanlama-form-alani' });
    const formAc = (kural) => {
      yerlestir(formAlani, kuralFormu({ ...secenekler, kural, kapat: () => formAlani.replaceChildren(), kaydedildi: () => { void ciz(); } }));
      formAlani.scrollIntoView({ block: 'nearest' });
    };
    const ekle = h('button', { type: 'button', class: 'birincil', onclick: () => formAc(null) }, '+ Zamanlanmış koşu ekle');
    yerlestir(kart,
      h('div', { class: 'bolum-basligi' }, h('h3', {}, ikon('tarih'), 'Zamanlanmış koşular', rozet(String(veri.kurallar.length))), ekle),
      h('p', { class: 'soluk' }, KILAVUZ),
      veri.suren ? h('div', { class: 'not-kutusu uyari', role: 'status' }, `Şu an zamanlanmış koşu sürüyor: "${veri.suren.ad}".`) : null,
      formAlani,
      veri.kurallar.length ? h('ul', { class: 'kayit-listesi zamanlama-listesi' }, veri.kurallar.map((k) => kuralSatiri(k, { ...secenekler, duzenle: formAc, yenile: ciz })))
        : bosDurum('Zamanlanmış koşu yok.', 'Nöbetçi\'nin belirli zamanlarda kendiliğinden koşu başlatması için "+ Zamanlanmış koşu ekle"ye basın.', { ikon: 'tarih', rol: 'status' }),
      secenek.davranisFormu ? h('div', { class: 'zamanlama-davranisi' }, h('h4', {}, 'Zamanlanmış koşu davranışı'), await secenek.davranisFormu()) : null,
      await arkaPlanBolumu().catch((hata) => {
        if (hata && hata.durum === 423) throw hata;
        return h('div', { class: 'not-kutusu hata', role: 'alert' }, `Kilitliyken çalışma tercihleri yüklenemedi: ${hata.message || hata}`);
      }));
  };
  await ciz();
  return kart;
}

// ---------------------------------------------------------------------------------------
// Kasa kilitliyken ve açılışta (A / B / C tercihleri)
// ---------------------------------------------------------------------------------------

const TERCIHLER = [
  {
    ad: 'kilitliyken',
    baslik: 'Kasa kilitlense de zamanlanmış koşular çalışsın (anahtar yalnız bellekte)',
    metin: 'Kasa kilitlenince (elle ya da otomatik kilit) arayüz kilitlenir ve ekranda hiçbir veri görünmez; ancak kasa anahtarının bir kopyası yalnız zamanlayıcının kullanabildiği bellekte kalır ve vakti gelen koşular yapılır. '
      + 'Nöbetçi kapanınca ya da yeniden başlayınca anahtar silinir; diske hiçbir şey yazılmaz. Kilitlerken "Tamamen kilitle"yi seçerek anahtarı da silebilirsiniz.',
    risk: 'Risk: Nöbetçi açıkken bu bilgisayarın belleğini okuyabilen biri (ör. yönetici yetkili zararlı bir program) kasa anahtarına ulaşabilir; kilitli kasa, bu seçenek kapalıyken olduğu kadar güçlü korunmaz.'
  },
  {
    ad: 'dpapi',
    windows: true,
    baslik: 'Windows oturumuna bağlı otomatik açma (DPAPI)',
    metin: 'Kasa anahtarı Windows\'un veri koruma özelliğiyle (DPAPI, yalnız sizin Windows hesabınız) şifrelenip bu çalışma alanının klasörüne yazılır; düz anahtar diske yazılmaz. '
      + 'Nöbetçi açılınca bu dosya çözülür ve anahtar yalnız zamanlanmış koşulara verilir: arayüz kilitli başlar, ekranı açmak için yine parolanız gerekir. '
      + 'Açıkken kilitleme de üstteki seçenek gibi davranır. Dosya yedeklere ve pakete girmez; kasa parolası değişince yenilenir; kapatınca güvenli biçimde silinir.',
    risk: 'Risk: Windows oturumunuzu ele geçiren biri zamanlanmış koşuların kullandığı verilere erişebilir. Açmak için kasa parolanız yeniden sorulur.'
  },
  {
    ad: 'oturumAcilisi',
    windows: true,
    baslik: 'Bilgisayar açılınca Nöbetçi arka planda başlasın',
    metin: 'Windows Görev Zamanlayıcı\'ya sizin hesabınızla, yönetici izni gerektirmeden çalışan "Nöbetçi (arka plan)" görevi eklenir: oturum açınca Nöbetçi pencere ya da tarayıcı açmadan başlar (zaten açıksa bir şey yapmaz). '
      + 'Kasa kilitli başlar; zamanlanmış koşuların çalışması için "Windows oturumuna bağlı otomatik açma"yı da açın ya da Nöbetçi\'yi açıp kasayı açın. Kapatınca görev silinir.',
    risk: 'Risk: Nöbetçi siz fark etmeden arka planda çalışır ve bilgisayarın kaynaklarını kullanır (yalnız bu bilgisayardan, 127.0.0.1 üzerinden erişilebilir).'
  }
];

/** Açık kasa: tercihler + DPAPI dosyası + Windows görevinin gerçek durumu (schtasks /Query). */
async function arkaPlanBolumu() {
  const bolum = h('section', { class: 'zamanlama-tercihleri', 'aria-label': 'Kasa kilitliyken ve açılışta' });
  const mesaj = mesajKutusu();
  const ciz = (veri) => {
    const satirlar = TERCIHLER.filter((t) => !t.windows || veri.windows).map((t) => tercihSatiri(t, veri, { mesaj, yenile: ciz }));
    yerlestir(bolum,
      h('h4', {}, ikon('kilit'), 'Kasa kilitliyken ve açılışta'),
      h('p', { class: 'soluk kucuk' }, 'Üç seçenek de varsayılan olarak kapalıdır ve ayrı ayrı açılır. Kapalıyken zamanlanmış koşular yalnız kasa açıkken çalışır.'),
      veri.uyari ? h('div', { class: 'not-kutusu uyari', role: 'status' }, veri.uyari) : null,
      mesaj.kutu,
      h('ul', { class: 'kayit-listesi zamanlama-tercih-listesi' }, satirlar),
      veri.windows ? null : h('p', { class: 'soluk kucuk' }, 'Windows oturumuna bağlı açma ve oturum açılışında başlatma yalnız Windows\'ta kullanılabilir.'));
  };
  ciz(await api('/platform/zamanlama/tercihler'));
  return bolum;
}

function tercihDurumMetni(t, veri) {
  if (t.ad === 'dpapi') {
    if (!veri.dpapi.dosyaVar) return 'Şifreli anahtar dosyası: yok.';
    return veri.dpapi.gecerli ? 'Şifreli anahtar dosyası: var (bu kasaya ait).' : 'Şifreli anahtar dosyası: var ama bu kasanın güncel anahtarına ait değil.';
  }
  if (t.ad === 'oturumAcilisi') {
    const g = veri.gorev;
    if (!g) return null;
    const hedef = g.paket ? 'Nöbetçi.exe --arka-plan' : 'proje klasöründeki node + scripts/baslat.mjs --arka-plan';
    const var_ = g.var === null ? 'sorgulanamadı' : g.var ? 'Windows Görev Zamanlayıcı\'da kayıtlı' : 'kayıtlı değil';
    return `Görev: ${var_} · hedef: ${hedef}.`;
  }
  return veri.anahtarBellekte ? 'Zamanlayıcı için anahtar şu an bellekte.' : null;
}

function tercihSatiri(t, veri, s) {
  const acik = t.ad === 'oturumAcilisi' && veri.gorev && veri.gorev.var !== null ? veri.gorev.var : veri.tercihler[t.ad];
  const anahtar = h('input', { type: 'checkbox', class: 'anahtar', checked: Boolean(acik), role: 'switch', id: yeniKimlik('zt'), 'aria-label': t.baslik });
  anahtar.addEventListener('change', async () => {
    const yeni = anahtar.checked;
    anahtar.checked = !yeni; // sonuç gelene kadar eski hâlinde
    s.mesaj.temizle();
    const govde = await tercihOnayi(t, yeni);
    if (!govde) return;
    anahtar.disabled = true;
    try {
      const r = await api('/platform/zamanlama/tercih', { govde: { ad: t.ad, acik: yeni, ...govde } });
      bildir(yeni ? `"${t.baslik}" açıldı.` : `"${t.baslik}" kapatıldı.`);
      s.yenile(r);
    } catch (hata) {
      anahtar.disabled = false;
      s.mesaj.goster(hata.message);
    }
  });
  const durum = tercihDurumMetni(t, veri);
  return h('li', {},
    h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon(t.ad === 'oturumAcilisi' ? 'bilgisayar' : t.ad === 'dpapi' ? 'anahtar' : 'kilit')),
    h('div', { class: 'kayit-ana' },
      h('label', { for: anahtar.id }, h('strong', {}, t.baslik), acik ? rozet('Açık', 'basari') : rozet('Kapalı', 'durdu')),
      h('p', { class: 'soluk kucuk' }, t.metin),
      h('p', { class: 'kucuk zamanlama-risk' }, t.risk),
      durum ? h('div', { class: 'kayit-meta' }, durum) : null),
    h('div', { class: 'kayit-eylemleri' }, anahtar));
}

/** Açma / kapatma onayı; B'yi açarken parola da sorulur. Vazgeçilirse null. */
function tercihOnayi(t, yeni) {
  return new Promise((coz) => {
    const parola = t.ad === 'dpapi' && yeni ? parolaAlani('Kasa parolası', { zorunlu: true, otomatik: 'current-password' }) : null;
    const riskOnayi = h('input', { type: 'checkbox', id: yeniKimlik('zt-onay') });
    const mesaj = mesajKutusu();
    const tamam = h('button', { type: 'submit', class: yeni ? 'birincil' : 'tehlike' }, yeni ? 'Aç' : 'Kapat');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const kapatmaMetni = t.ad === 'dpapi' ? 'Şifreli anahtar dosyası güvenli biçimde silinir; Nöbetçi açılışta kasa anahtarını artık bilmez.'
      : t.ad === 'oturumAcilisi' ? 'Windows Görev Zamanlayıcı\'daki "Nöbetçi (arka plan)" görevi silinir.'
        : 'Kasa kilitliyken zamanlanmış koşular artık çalışmaz; bellekteki anahtar kopyası silinir.';
    const form = h('form', { class: 'diyalog-govde', novalidate: true },
      h('h2', {}, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('kilit')), yeni ? `Aç: ${t.baslik}` : `Kapat: ${t.baslik}`),
      yeni ? h('p', { class: 'soluk' }, t.metin) : h('p', { class: 'soluk' }, kapatmaMetni),
      yeni ? h('div', { class: 'not-kutusu uyari' }, h('p', {}, t.risk)) : null,
      mesaj.kutu,
      parola ? parola.kapsayici : null,
      yeni ? h('label', { class: 'onay-satiri', for: riskOnayi.id }, riskOnayi, 'Ne yaptığını ve riskini okudum; açmak istiyorum') : null,
      h('div', { class: 'diyalog-alt' }, vazgec, tamam));
    const diyalog = h('dialog', { class: 'onay-diyalogu', 'aria-label': t.baslik }, form);
    let sonuc = null;
    form.addEventListener('submit', (o) => {
      o.preventDefault();
      mesaj.temizle();
      if (parola && !parola.girdi.value) { alanHatasi(parola.girdi, 'Kasa parolasını girin.'); parola.girdi.focus(); return; }
      if (yeni && !riskOnayi.checked) { mesaj.goster('Açmak için riski okuduğunuzu onaylayın.'); riskOnayi.focus(); return; }
      sonuc = { onay: true, ...(parola ? { parola: parola.girdi.value } : {}) };
      if (parola) parola.girdi.value = '';
      diyalog.close();
    });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    (parola ? parola.girdi : vazgec).focus();
  });
}

/**
 * Kasayı kilitle (üst çubuk, hesap menüsü, Ayarlar > Güvenlik): "kilitliyken çalışsın" ya da DPAPI açıksa iki seçenek sunulur —
 * "Kilitle (zamanlanmış koşular sürsün)" / "Tamamen kilitle (anahtarı da sil)". Tercihler kapalıyken (ya da durum okunamazsa)
 * doğrudan TAMAMEN kilitler: sunucuya her zaman açıkça tamamen:true gider (arada tercih açılmış olsa bile anahtar bellekte kalmaz).
 * Dönen değer sunucunun yanıtına göredir, kullanıcının seçimine göre değil.
 * @returns {Promise<'surdur' | 'tamamen' | 'tamamen-suren-is' | null>} null: vazgeçildi; 'tamamen-suren-is': anahtar silindi,
 *   süren zamanlanmış koşu kalan adımları atlayacak
 */
export async function kasayiKilitleSecimli() {
  let secimVar = false;
  try { const d = await api('/platform/durum'); secimVar = Boolean(d.zamanlama && d.zamanlama.kilitSecimi); } catch { secimVar = false; }
  if (!secimVar) return kilitSonucu(await api('/platform/kasa/kilitle', { govde: { tamamen: true } }));
  const secim = await new Promise((coz) => {
    let deger = null;
    const surdur = h('button', { type: 'button', class: 'birincil' }, ikon('kilit'), 'Kilitle (zamanlanmış koşular sürsün)');
    const tamamen = h('button', { type: 'button', class: 'tehlike' }, 'Tamamen kilitle (anahtarı da sil)');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const diyalog = h('dialog', { class: 'onay-diyalogu', 'aria-labelledby': 'kilit-secimi-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'kilit-secimi-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('kilit')), 'Kasayı kilitle'),
        h('p', { class: 'soluk' }, 'Kilitle: arayüz kilitlenir, ekranda hiçbir veri görünmez; kasa anahtarı yalnız zamanlanmış koşular için bellekte kalır.'),
        h('p', { class: 'soluk' }, 'Tamamen kilitle: bellekteki anahtar da silinir; kasa yeniden açılana kadar zamanlanmış koşular çalışmaz.')),
      h('div', { class: 'diyalog-alt' }, vazgec, tamamen, surdur));
    surdur.addEventListener('click', () => { deger = 'surdur'; diyalog.close(); });
    tamamen.addEventListener('click', () => { deger = 'tamamen'; diyalog.close(); });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(deger); });
    document.body.append(diyalog);
    diyalog.showModal();
    surdur.focus();
  });
  if (!secim) return null;
  return kilitSonucu(await api('/platform/kasa/kilitle', { govde: { tamamen: secim === 'tamamen' } }));
}

/** @param {{ arkaPlan?: boolean; surenIs?: boolean }} r /platform/kasa/kilitle yanıtı */
function kilitSonucu(r) {
  if (r.arkaPlan) return 'surdur';
  return r.surenIs ? 'tamamen-suren-is' : 'tamamen';
}

/**
 * Kilitleme sonrası kullanıcıya gösterilecek bildirim (üst çubuk, hesap menüsü, Ayarlar > Güvenlik ortak).
 * @param {'surdur' | 'tamamen' | 'tamamen-suren-is'} secim
 * @returns {[string, 'basari' | 'hata']} 'hata': uyarı simgesiyle, daha uzun süre görünür
 */
export function kilitBildirimi(secim) {
  if (secim === 'surdur') return ['Kasa kilitlendi; zamanlanmış koşular sürüyor.', 'basari'];
  if (secim === 'tamamen-suren-is') {
    return ['Kasa tamamen kilitlendi; anahtar bellekten silindi. Süren zamanlanmış koşu kasa anahtarı olmadan devam edemez: kalan senaryoları koşulmayacak.', 'hata'];
  }
  return ['Kasa kilitlendi.', 'basari'];
}

function kapsamMetni(k, s) {
  const ekranAdi = (id) => (s.ekranlar.find((e) => e.id === id) || { ad: 'silinmiş ekran' }).ad;
  const akisAdi = (id) => ([...s.akislar, ...s.uctanUcalar].find((a) => a.id === id) || { baslik: 'silinmiş akış' }).baslik;
  const parcalar = [];
  if (k.kapsam.senaryolar === 'tum') parcalar.push('Tüm "Koşuda" senaryolar');
  else if (k.kapsam.senaryolar === 'ekranlar') parcalar.push(`Ekranlar: ${k.kapsam.ekranIdleri.map(ekranAdi).join(', ')}`);
  if (k.kapsam.servisAkisIdleri.length) parcalar.push(`Servis akışları: ${k.kapsam.servisAkisIdleri.map(akisAdi).join(', ')}`);
  const uctan = k.kapsam.uctanUcaAkisIdleri || [];
  if (uctan.length) parcalar.push(`Uçtan uca akışlar: ${uctan.map(akisAdi).join(', ')}`);
  return parcalar.join(' · ');
}

/** Tetiklemenin sonuç bağlantıları: ekran koşusu ve uçtan uca akış koşuları (Sonuçlar > Uçtan uca akışlar). */
const sonucBaglantisi = (t) => {
  const uctan = (t.akisKosulari || []).filter((a) => a.uctanUca && a.kosuId);
  const b = [
    t.kosuId ? h('a', { href: `#/sonuclar/kosu/${encodeURIComponent(t.kosuId)}` }, 'Sonuçları aç') : null,
    ...uctan.map((a, n) => h('a', { href: `#/sonuclar/uctan-uca/${encodeURIComponent(a.kosuId)}` }, uctan.length > 1 ? `Uçtan uca sonucu ${n + 1}` : 'Uçtan uca sonucu'))
  ].filter(Boolean);
  return b.length ? h('span', { class: 'zamanlama-sonuclari' }, ...b.flatMap((x, n) => (n ? [' · ', x] : [x]))) : null;
};

function kuralSatiri(k, s) {
  const etkin = h('input', { type: 'checkbox', class: 'anahtar', checked: k.etkin, role: 'switch', 'aria-label': `${k.ad}: etkin` });
  etkin.addEventListener('change', async () => {
    etkin.disabled = true;
    try {
      await api('/platform/zamanlanmis-kosu/etkin', { govde: { projeId: s.proje.id, id: k.id, etkin: etkin.checked } });
      bildir(etkin.checked ? `"${k.ad}" etkinleştirildi; bundan sonraki zamanlarda çalışır.` : `"${k.ad}" pasifleştirildi.`);
      await s.yenile();
    } catch (hata) { etkin.checked = !etkin.checked; etkin.disabled = false; bildir(hata.message, 'hata'); }
  });
  const sil = h('button', { type: 'button', class: 'kucuk-dugme tehlike', 'aria-label': `${k.ad}: sil` }, ikon('cop'), 'Sil');
  sil.addEventListener('click', async () => {
    const tamam = await onayIste({ baslik: 'Zamanlanmış koşuyu sil', metin: `"${k.ad}" ve tetikleme geçmişi silinecek. Koşu sonuçları silinmez.`, dugme: 'Sil', tehlikeli: true });
    if (!tamam) return;
    try {
      await api('/platform/zamanlanmis-kosu/sil', { govde: { projeId: s.proje.id, id: k.id } });
      bildir('Zamanlanmış koşu silindi.');
      await s.yenile();
    } catch (hata) { bildir(hata.message, 'hata'); }
  });
  const son = k.sonTetikleme;
  const gecmis = h('details', { class: 'zamanlama-gecmisi' }, h('summary', {}, `Geçmiş (son ${k.gecmis.length} tetikleme)`),
    k.gecmis.length ? h('table', { class: 'veri-tablosu' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Zaman'), h('th', {}, 'Durum'), h('th', {}, 'Ayrıntı'), h('th', {}, 'Sonuç'))),
      h('tbody', {}, k.gecmis.map((t) => h('tr', {},
        h('td', {}, tarihMetni(t.zaman)), h('td', {}, durumRozeti(t.durum)), h('td', { class: 'kucuk' }, t.mesaj || '—'), h('td', {}, sonucBaglantisi(t) || '—')))))
      : h('p', { class: 'soluk kucuk' }, 'Henüz tetiklenmedi.'));
  return h('li', { class: k.etkin ? null : 'pasif-kayit' },
    h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon('tarih')),
    h('div', { class: 'kayit-ana' },
      h('strong', {}, k.ad, k.etkin ? null : rozet('Pasif', 'durdu'), k.riskli ? rozet('Riskli', 'hata', { title: 'Riskli ortamda zamanlanmış koşu (kayıtta onaylandı)' }) : null),
      h('div', { class: 'kayit-meta' }, [k.zamanMetni, k.ortamAdi || 'silinmiş ortam', kapsamMetni(k, s), k.bildirimAdi ? `Bildirim: ${k.bildirimAdi}` : null].filter(Boolean).join(' · ')),
      h('div', { class: 'kayit-meta' }, k.etkin ? `Sonraki çalışma: ${tarihMetni(k.sonrakiCalisma)}` : 'Pasif: çalışmaz.'),
      son ? h('div', { class: 'kayit-meta zamanlama-son' }, `Son çalışma: ${tarihMetni(son.zaman)} `, durumRozeti(son.durum), son.mesaj ? ` ${son.mesaj} ` : ' ', sonucBaglantisi(son))
        : h('div', { class: 'kayit-meta soluk' }, 'Henüz çalışmadı.'),
      gecmis),
    h('div', { class: 'kayit-eylemleri' },
      h('label', { class: 'onay-satiri' }, etkin, 'Etkin'),
      h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${k.ad}: düzenle`, onclick: () => s.duzenle(k) }, ikon('duzenle'), 'Düzenle'),
      sil));
}

/** Onay kutusu listesi (ekranlar / servis akışları / günler). */
function kutuListesi(ogeler, secili, etiket) {
  const kutular = ogeler.map(([deger, metin]) => {
    const k = h('input', { type: 'checkbox', value: String(deger), checked: secili.includes(deger), id: yeniKimlik('zk') });
    return { k, el: h('label', { for: k.id }, k, metin) };
  });
  return {
    el: h('fieldset', { class: 'zamanlama-kutulari' }, h('legend', {}, etiket), h('div', { class: 'ortam-secimleri' }, kutular.map((x) => x.el))),
    secilenler: () => kutular.filter((x) => x.k.checked).map((x) => x.k.value),
    kutular: kutular.map((x) => x.k)
  };
}

function kuralFormu(s) {
  const k = s.kural;
  const mesaj = mesajKutusu();
  const ad = h('input', { type: 'text', maxlength: '80', value: k ? k.ad : '', placeholder: 'ör. Gece tam koşu', autocomplete: 'off' });
  const ortam = h('select', {}, s.ortamlar.map((o) => h('option', { value: o.id, selected: k ? k.ortamId === o.id : o.varsayilan }, o.ad)));

  // Kapsam
  const kapsamTuru = h('select', {},
    h('option', { value: 'tum' }, 'Tüm "Koşuda" senaryolar (tam koşu)'),
    h('option', { value: 'ekranlar' }, 'Seçili ekranların "Koşuda" senaryoları'),
    h('option', { value: 'yok' }, 'Senaryo yok (yalnız akışlar)'));
  kapsamTuru.value = k ? k.kapsam.senaryolar : 'tum';
  const ekranKutulari = kutuListesi(s.ekranlar.map((e) => [e.id, e.durum === 'devre_disi' ? `${e.ad} (devre dışı)` : e.ad]), k ? k.kapsam.ekranIdleri : [], 'Ekranlar');
  const akisKutulari = kutuListesi(s.akislar.map((a) => [a.id, a.baslik]), k ? k.kapsam.servisAkisIdleri : [], 'Servis akışları (isteğe bağlı)');
  const uctanKutulari = kutuListesi(s.uctanUcalar.map((a) => [a.id, a.baslik]), k ? k.kapsam.uctanUcaAkisIdleri || [] : [], 'Uçtan uca akışlar (isteğe bağlı)');
  const kapsamGuncelle = () => { ekranKutulari.el.hidden = kapsamTuru.value !== 'ekranlar'; };
  kapsamTuru.addEventListener('change', kapsamGuncelle);
  kapsamGuncelle();

  // Zaman
  const z = k ? k.zaman : { tur: 'gunluk', saat: '07:00' };
  const zamanTuru = h('select', {},
    h('option', { value: 'gunluk' }, 'Her gün'), h('option', { value: 'haftalik' }, 'Haftanın seçili günleri'), h('option', { value: 'aralik' }, 'Her N saatte bir'));
  zamanTuru.value = z.tur;
  const saat = h('input', { type: 'time', value: z.saat || '07:00', step: '60' });
  const gunKutulari = kutuListesi(GUNLER, z.gunler || [1, 2, 3, 4, 5], 'Günler');
  const aralik = h('select', {}, ARALIKLAR.map((n) => h('option', { value: String(n), selected: n === (z.saatAraligi || 4) }, `${n} saatte bir`)));
  const baslangic = h('input', { type: 'time', value: z.baslangic || '00:00', step: '60' });
  const saatAlani = alan('Saat', saat);
  const aralikAlani = alan('Sıklık', aralik);
  const baslangicAlani = alan('Başlangıç saati', baslangic, { yardim: 'Gün içindeki saatler bu saatten başlayarak hesaplanır (ör. 00:30 ve 4 saat → 00:30, 04:30, 08:30 …).' });
  const onizleme = h('p', { class: 'soluk kucuk', 'aria-live': 'polite' });
  const zamanOku = () => (zamanTuru.value === 'gunluk' ? { tur: 'gunluk', saat: saat.value }
    : zamanTuru.value === 'haftalik' ? { tur: 'haftalik', saat: saat.value, gunler: gunKutulari.secilenler().map(Number) }
      : { tur: 'aralik', saatAraligi: Number(aralik.value), baslangic: baslangic.value });
  let onizlemeSirasi = 0;
  const onizle = async () => {
    const sira = ++onizlemeSirasi;
    try {
      const r = await api('/platform/zamanlanmis-kosu/onizle', { govde: { zaman: zamanOku() } });
      if (sira === onizlemeSirasi) onizleme.textContent = `${r.metin}. Sonraki çalışmalar: ${r.sonrakiler.map(tarihMetni).join(' · ')}`;
    } catch (hata) { if (sira === onizlemeSirasi) onizleme.textContent = hata.message; }
  };
  const zamanGuncelle = () => {
    saatAlani.hidden = zamanTuru.value === 'aralik';
    gunKutulari.el.hidden = zamanTuru.value !== 'haftalik';
    aralikAlani.hidden = zamanTuru.value !== 'aralik';
    baslangicAlani.hidden = zamanTuru.value !== 'aralik';
    void onizle();
  };
  for (const g of [zamanTuru, saat, aralik, baslangic, ...gunKutulari.kutular]) g.addEventListener('change', zamanGuncelle);
  zamanGuncelle();

  // Bildirim
  const bildirim = h('select', { disabled: !s.webhooklar.length },
    h('option', { value: '' }, 'Bildirim gönderme'),
    s.webhooklar.map((b) => h('option', { value: b.id, selected: k ? k.bildirimBaglantiId === b.id : false }, `${b.ad}${b.etkin ? '' : ' (devre dışı)'}`)));
  const bildirimAlani = alan('Sonuçları bildir', bildirim, {
    yardim: s.webhooklar.length ? 'Koşu bitince özet, seçtiğiniz webhook bağlantısına gönderilir (bağlantı devre dışıysa gönderilmez).'
      : 'Seçmek için Ayarlar > Entegrasyonlar\'da bir webhook bağlantısı ekleyin.'
  });

  // Canlı ortam onayı
  const canliOnay = h('input', { type: 'checkbox', checked: k ? k.canliOnay : false, id: yeniKimlik('zk-canli') });
  const canliKutusu = h('div', { class: 'not-kutusu hata', role: 'alert' },
    h('p', {}, h('strong', {}, 'Dikkat: '), 'Seçilen ortam riskli (ya da riskli olup olmadığı belirtilmemiş). Zamanlanmış koşu bu ortamda sizin başında olmadığınız bir anda gerçek işlemler yapabilir.'),
    h('label', { class: 'onay-satiri', for: canliOnay.id }, canliOnay, 'Canlı ortamda zamanlanmış koşuya izin veriyorum'));
  const riskGuncelle = () => { canliKutusu.hidden = !ortamRiskli(s.ortamlar.find((o) => o.id === ortam.value)); };
  ortam.addEventListener('change', riskGuncelle);
  riskGuncelle();

  const etkin = h('input', { type: 'checkbox', checked: k ? k.etkin : true, id: yeniKimlik('zk-etkin') });
  const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  const form = h('form', { class: 'kart form-paneli zamanlama-formu', novalidate: true, 'aria-label': k ? `${k.ad}: düzenle` : 'Yeni zamanlanmış koşu' },
    h('h3', {}, k ? `Düzenle: ${k.ad}` : 'Yeni zamanlanmış koşu'), mesaj.kutu,
    alan('Ad', ad, { zorunlu: true }), alan('Ortam', ortam, { zorunlu: true }), canliKutusu,
    h('fieldset', {}, h('legend', {}, 'Ne koşulsun?'), alan('Senaryolar', kapsamTuru), ekranKutulari.el, s.akislar.length ? akisKutulari.el : null,
      s.uctanUcalar.length ? uctanKutulari.el : null,
      s.uctanUcalar.length ? h('p', { class: 'soluk kucuk' }, 'Uçtan uca akışlar arayüzdeki "Koş" ile aynı denetimle koşar: kapalı izne tabi akış atlanır ve geçmişe yazılır.') : null),
    h('fieldset', {}, h('legend', {}, 'Ne zaman?'), alan('Tekrar', zamanTuru), saatAlani, gunKutulari.el, aralikAlani, baslangicAlani, onizleme,
      h('p', { class: 'soluk kucuk' }, 'Kasa kilitliyken ya da Nöbetçi kapalıyken kaçan zamanlar varsayılan olarak koşulmaz; bir sonraki zaman beklenir (Zamanlanmış koşu davranışı > Kaçan zaman).')),
    bildirimAlani,
    h('label', { class: 'onay-satiri', for: etkin.id }, etkin, 'Etkin'),
    h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'hayalet', onclick: () => s.kapat() }, 'Vazgeç'), kaydet));
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    mesaj.temizle();
    alanHatasi(ad, '');
    if (!ad.value.trim()) { alanHatasi(ad, 'Bir ad girin.'); ad.focus(); return; }
    if (!canliKutusu.hidden && !canliOnay.checked) { mesaj.goster('Canlı / riskli ortam: kaydetmek için "Canlı ortamda zamanlanmış koşuya izin veriyorum" kutusunu işaretleyin.'); canliOnay.focus(); return; }
    const kural = {
      ...(k ? { id: k.id } : {}), ad: ad.value.trim(), ortamId: ortam.value,
      kapsam: { senaryolar: kapsamTuru.value, ekranIdleri: kapsamTuru.value === 'ekranlar' ? ekranKutulari.secilenler() : [], servisAkisIdleri: akisKutulari.secilenler(),
        uctanUcaAkisIdleri: uctanKutulari.secilenler() },
      zaman: zamanOku(), etkin: etkin.checked, bildirimBaglantiId: bildirim.value || null, canliOnay: !canliKutusu.hidden && canliOnay.checked
    };
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/zamanlanmis-kosu/kaydet', { govde: { projeId: s.proje.id, kural } }));
      bildir(k ? 'Zamanlanmış koşu güncellendi.' : 'Zamanlanmış koşu eklendi.');
      s.kapat();
      s.kaydedildi();
    } catch (hata) { mesaj.goster(hata.message); }
  });
  return form;
}
