// Ayarlar > Giriş profilleri > "Giriş tarifi" (genel): ortam başına giriş sayfasının tarifi — seçiciler,
// başarı/hata göstergeleri, iki aşamalı doğrulama adımı ve isteğe bağlı bağlam değiştirme adımları.
// Tarifte gizli değer yoktur (parola/anahtar/kod giriş profilindedir). "Varsayılanları öner" YALNIZCA
// kullanıcı açıkça isteyip onaylayınca ortamın giriş sayfasını sunucuda görünmez bir tarayıcıda açar
// (alan doldurmaz, göndermez). Kaydetme sunucuda doğrulanır (scripts/platform/giris/tarif.mjs).
import { alan, alanHatasi, api, bildir, bosDurum, h, ikon, mesajKutusu, mesgulIken, rozet, yeniKimlik } from './ortak.js';
import { onayIste } from './kosu-paneli.js';

const IKINCI_ADIM_ETIKETI = { yok: 'Yok', totp: 'Authenticator (TOTP)', sms: 'SMS' };
const KAYNAK_ROZETI = {
  kayitli: ['Kaydedilmiş', 'basari'],
  'proje-varsayilani': ['Proje varsayılanı', 'vurgu'],
  yok: ['Tanımlı değil', 'uyari']
};
const SECICI_YARDIMI = 'Playwright seçicisi: CSS (#kimlik, input[name="kullanici"]), text=Giriş ya da role=button[name="Giriş"]. Birden fazla öğe eşleşirse ilki kullanılır.';

/** Boş tarif iskeleti (yeni tarif). */
const bosTarif = () => ({
  girisAdresi: '/', oturumKontrolAdresi: '/', kullaniciAlani: '', parolaAlani: '', gonderDugmesi: '',
  basariGostergesi: { tur: 'metin', deger: '' }, hataGostergeleri: [], ikinciAdim: { tur: 'yok' }, zamanAsimiSn: 45, baglamDegistirme: null
});

const monoGirdi = (deger, ek = {}) => h('input', { type: 'text', class: 'mono', autocomplete: 'off', spellcheck: 'false', value: deger ?? '', ...ek });

/** Tarifin tek satırlık özeti. */
function ozet(t) {
  if (!t) return 'Bu ortamda giriş yapılamaz; tarif tanımlayın.';
  const parca = [`Giriş: ${t.girisAdresi}`, `2FA: ${IKINCI_ADIM_ETIKETI[t.ikinciAdim.tur] || t.ikinciAdim.tur}`];
  parca.push(t.baglamDegistirme ? `Bağlam: ${t.baglamDegistirme.baglamTuru} (${t.baglamDegistirme.adimlar.length} adım)` : 'Bağlam değiştirme yok');
  return parca.join(' · ');
}

/**
 * Giriş profilleri sayfasının altına tarif bölümünü çizer.
 * @param {HTMLElement} kapsayici @param {{ durum: any }} baglam
 */
export async function girisTarifiBolumu(kapsayici, baglam) {
  const proje = baglam.durum.proje;
  const veri = await api(`/platform/giris-tarifleri?projeId=${encodeURIComponent(proje.id)}`);
  const formAlani = h('div', {});
  const liste = h('ul', { class: 'kayit-listesi' });
  const ciz = () => {
    liste.replaceChildren(...veri.ortamlar.map((o) => {
      const [rozetMetni, rozetTuru] = KAYNAK_ROZETI[o.kaynak] || KAYNAK_ROZETI.yok;
      return h('li', { 'data-ortam': o.ortamId },
        h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon('anahtar')),
        h('div', { class: 'kayit-ana' }, h('strong', {}, o.ortamAd, ' ', rozet(rozetMetni, rozetTuru)),
          h('div', { class: 'kayit-meta' }, ozet(o.tarif)),
          o.hatalar && o.hatalar.length ? h('div', { class: 'kayit-meta hata-metni' }, `Tarif geçersiz: ${o.hatalar.join(' ')}`) : null),
        h('div', { class: 'kayit-eylemleri' },
          h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${o.ortamAd}: giriş tarifini düzenle`, onclick: () => tarifFormu(o) }, ikon('duzenle'), o.tarif ? 'Düzenle' : 'Tanımla')));
    }));
  };
  const guncelle = (yeni) => {
    const i = veri.ortamlar.findIndex((x) => x.ortamId === yeni.ortamId);
    if (i >= 0) veri.ortamlar[i] = yeni;
    ciz();
  };

  const tarifFormu = (o) => {
    const t = JSON.parse(JSON.stringify(o.tarif || bosTarif()));
    const mesaj = mesajKutusu();
    const girisAdresi = monoGirdi(t.girisAdresi);
    const oturumAdresi = monoGirdi(t.oturumKontrolAdresi);
    const kullanici = monoGirdi(t.kullaniciAlani);
    const parola = monoGirdi(t.parolaAlani);
    const gonder = monoGirdi(t.gonderDugmesi);

    // --- Varsayılanları öner (yalnızca açık istek + onay) ---------------------------------
    const oneriNotu = h('div', { role: 'status' });
    const oner = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('simsek'), 'Varsayılanları öner');
    oner.addEventListener('click', async () => {
      const yol = girisAdresi.value.trim() || '/';
      let adres = yol;
      try { adres = new URL(yol, o.tabanUrl).toString(); } catch { /* sunucu doğrular */ }
      const tamam = await onayIste({
        baslik: 'Giriş sayfası açılsın mı?',
        metin: `Nöbetçi, ${adres} adresini bu bilgisayarda görünmez bir tarayıcıda açıp sayfadaki giriş formunu inceleyecek. Hiçbir alan doldurulmaz, hiçbir şey gönderilmez; yine de sitenin sunucusuna bir sayfa isteği gider.`,
        dugme: 'Sayfayı aç ve öner', ikonAd: 'ag'
      });
      if (!tamam) return;
      oneriNotu.replaceChildren();
      try {
        const { oneri } = await mesgulIken(oner, 'Sayfa inceleniyor…', () => api('/platform/giris-tarifi/oner', {
          govde: { projeId: proje.id, ortamId: o.ortamId, girisAdresi: girisAdresi.value.trim() }
        }));
        if (oneri.captcha && oneri.captcha.length) {
          oneriNotu.replaceChildren(h('div', { class: 'not-kutusu hata' }, 'Sayfada CAPTCHA algılandı. Test ortamında CAPTCHA kapatılmalı; otomasyon CAPTCHA çözmez.'));
        }
        if (!oneri.bulundu) {
          oneriNotu.append(h('div', { class: 'not-kutusu uyari' }, oneri.neden || 'Giriş formu bulunamadı.'));
          return;
        }
        if (oneri.kullaniciAlani) kullanici.value = oneri.kullaniciAlani;
        if (oneri.parolaAlani) parola.value = oneri.parolaAlani;
        if (oneri.gonderDugmesi) gonder.value = oneri.gonderDugmesi;
        oneriNotu.append(h('div', { class: 'not-kutusu basari' },
          h('p', {}, 'Öneriler alanlara yazıldı; kaydetmeden önce kontrol edin. Başarı göstergesini (giriş sonrası görünen metin/öğe) siz belirleyin.'),
          oneri.notlar && oneri.notlar.length ? h('ul', {}, oneri.notlar.map((n) => h('li', {}, n))) : null));
      } catch (hata) {
        oneriNotu.replaceChildren(h('div', { class: 'not-kutusu hata' }, hata.message));
      }
    });

    // --- Başarı / hata göstergeleri -------------------------------------------------------
    const basariTur = h('select', {}, [['metin', 'Sayfada görünen metin (tam eşleşme)'], ['url', 'Adres deseni (düzenli ifade)'], ['eleman', 'Öğe (seçici)']]
      .map(([d, m]) => h('option', { value: d, selected: t.basariGostergesi.tur === d }, m)));
    const basariDeger = monoGirdi(t.basariGostergesi.deger);
    const hataSatirlari = [];
    const hataKutusu = h('div', {});
    const hataEkle = (g = { tur: 'metin', deger: '' }) => {
      const tur = h('select', { 'aria-label': 'Hata göstergesi türü' }, [['metin', 'Metin'], ['eleman', 'Öğe (seçici)']].map(([d, m]) => h('option', { value: d, selected: g.tur === d }, m)));
      const deger = monoGirdi(g.deger, { 'aria-label': 'Hata göstergesi' });
      const s = { tur, deger, el: null };
      s.el = h('div', { class: 'gosterge-satiri' }, tur, deger,
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': 'Bu hata göstergesini kaldır', onclick: () => { hataSatirlari.splice(hataSatirlari.indexOf(s), 1); s.el.remove(); } }, ikon('carpi')));
      hataSatirlari.push(s);
      hataKutusu.append(s.el);
    };
    (t.hataGostergeleri || []).forEach(hataEkle);
    const zamanAsimi = h('input', { type: 'number', min: '5', max: '600', step: '1', value: String(t.zamanAsimiSn ?? 45) });

    // --- İkinci adım ----------------------------------------------------------------------
    const ikinci = t.ikinciAdim || { tur: 'yok' };
    const ad = yeniKimlik('ikinci');
    const radyo = (deger, metin) => {
      const r = h('input', { type: 'radio', name: ad, value: deger, id: yeniKimlik('r'), checked: ikinci.tur === deger });
      return { r, etiket: h('label', { class: 'secenek', for: r.id }, r, metin) };
    };
    const rYok = radyo('yok', 'Yok — kullanıcı adı ve parola yeterli');
    const rTotp = radyo('totp', 'Authenticator (TOTP) — kod giriş profilindeki anahtardan üretilir');
    const rSms = radyo('sms', 'SMS — kod telefona gelir');
    const kodAlani = monoGirdi(ikinci.kodAlani || '');
    const kodGonder = monoGirdi(ikinci.gonderDugmesi || '');
    const smsAd = yeniKimlik('sms');
    const smsRadyo = (deger, metin) => {
      const r = h('input', { type: 'radio', name: smsAd, value: deger, id: yeniKimlik('s'), checked: (ikinci.smsKipi ?? '') === deger });
      return { r, etiket: h('label', { class: 'secenek', for: r.id }, r, metin) };
    };
    const sProfil = smsRadyo('', 'Giriş profilindeki ayarı kullan');
    const sSabit = smsRadyo('sabit', 'Sabit test kodu (giriş profilinde kayıtlı)');
    const sElle = smsRadyo('elle', 'Koşu sırasında elle girilir');
    const elleSure = h('input', { type: 'number', min: '15', max: '1800', step: '5', value: String(ikinci.elleBeklemeSn ?? 180) });
    const smsAlani = h('div', { class: 'ic-alanlar' },
      h('div', { class: 'secenek-grubu', role: 'radiogroup', 'aria-label': 'SMS kodunun kaynağı' }, sProfil.etiket, sSabit.etiket, sElle.etiket),
      h('div', { class: 'not-kutusu bilgi' },
        h('p', {}, h('strong', {}, 'Elle kipi: '), 'Nöbetçi’den başlatılan koşularda giriş SMS kodu isteyince canlı koşu panelinde bir kod kutusu açılır; telefonunuza gelen kodu oraya yazarsınız. Terminalden başlatılan koşularda kod terminalde sorulur.'),
        h('p', {}, 'Kod aşağıdaki süre içinde girilmezse giriş “Doğrulama kodu alınamadı” hatasıyla durur. Etkileşimsiz koşularda (CI) elle kip kullanılamaz; sabit test kodu tanımlayın.')),
      alan('Kod bekleme süresi (sn)', elleSure, { yardim: '15–1800 saniye.' }));
    const kodAlanlari = h('div', { class: 'ic-alanlar' },
      alan('Kod alanı', kodAlani, { yardim: `Boş bırakılırsa kod alanı giriş sonrası sayfadan otomatik bulunur (tek kullanımlık kod alanına benzeyen alan). ${SECICI_YARDIMI}` }),
      alan('Kod gönder düğmesi', kodGonder, { yardim: 'Boş bırakılırsa giriş düğmesi kullanılır.' }),
      smsAlani);
    const ikinciGorunum = () => {
      kodAlanlari.hidden = rYok.r.checked;
      smsAlani.hidden = !rSms.r.checked;
    };
    [rYok.r, rTotp.r, rSms.r].forEach((r) => r.addEventListener('change', ikinciGorunum));
    ikinciGorunum();

    // --- Bağlam değiştirme ----------------------------------------------------------------
    const baglamVar = h('input', { type: 'checkbox', id: yeniKimlik('baglam'), checked: Boolean(t.baglamDegistirme) });
    const turListesiId = yeniKimlik('turler');
    const baglamTuru = h('input', { type: 'text', autocomplete: 'off', list: turListesiId, value: t.baglamDegistirme ? t.baglamDegistirme.baglamTuru : '' });
    const alanCipleri = h('div', { class: 'yer-tutucu-cipleri', 'aria-live': 'polite' });
    const cipleriCiz = () => {
      const tur = veri.baglamTurleri.find((x) => x.tur === baglamTuru.value.trim());
      const ogeler = tur && tur.alanlar.length
        ? [h('span', { class: 'soluk kucuk' }, 'Kullanılabilir yer tutucular:'), ...tur.alanlar.map((a) => h('code', {}, `{${a}}`))]
        : [h('span', { class: 'soluk kucuk' }, 'Bu türde bağlam profili yok; yer tutucular profil alan adlarıyla yazılır, ör. {subeKodu}.')];
      alanCipleri.replaceChildren(...ogeler);
    };
    baglamTuru.addEventListener('input', cipleriCiz);
    cipleriCiz();
    const adimlar = t.baglamDegistirme ? t.baglamDegistirme.adimlar.map((a) => JSON.parse(JSON.stringify(a))) : [];
    const adimListesi = h('ol', { class: 'tarif-adimlari' });
    const adimOzetMetni = h('span', {});
    const adimlariCiz = () => {
      adimListesi.replaceChildren(...adimlar.map((a, i) => adimSatiri(a, i)));
      adimOzetMetni.textContent = `Adımlar (${adimlar.length})`;
    };
    const adimSatiri = (a, i) => {
      const islem = h('select', { 'aria-label': `Adım ${i + 1}: işlem` }, veri.adimIslemleri.map((x) => h('option', { value: x.islem, selected: a.islem === x.islem }, x.etiket)));
      islem.addEventListener('change', () => {
        const yeni = { islem: islem.value };
        if (a.aciklama) yeni.aciklama = a.aciklama;
        if (['tikla', 'doldur', 'sec', 'gorunurBekle', 'degerBekle', 'sayiBekle', 'metinBekle'].includes(islem.value)) yeni.hedef = a.hedef || { secici: '' };
        adimlar[i] = yeni;
        adimlariCiz();
      });
      const govde = h('div', { class: 'tarif-adim-alanlari' });
      const girdi = (etiket, anahtar, yardim, nesne = a) => {
        const g = monoGirdi(nesne[anahtar] ?? '', { 'aria-label': `Adım ${i + 1}: ${etiket}` });
        g.addEventListener('input', () => { nesne[anahtar] = g.value; });
        return h('label', { class: 'mini-alan' }, h('span', {}, etiket), g, yardim ? h('small', { class: 'soluk' }, yardim) : null);
      };
      const hedefAlanlari = () => {
        a.hedef = a.hedef || { secici: '' };
        const rolMu = 'rol' in a.hedef;
        const tur = h('select', { 'aria-label': `Adım ${i + 1}: hedef türü` }, h('option', { value: 'secici', selected: !rolMu }, 'Seçici'), h('option', { value: 'rol', selected: rolMu }, 'Rol + ad'));
        tur.addEventListener('change', () => { a.hedef = tur.value === 'rol' ? { rol: 'button', ad: '' } : { secici: '' }; adimlariCiz(); });
        const parcalar = [h('label', { class: 'mini-alan dar' }, h('span', {}, 'Hedef'), tur)];
        if (rolMu) {
          parcalar.push(girdi('Rol', 'rol', 'ör. button, link, textbox', a.hedef), girdi('Erişilebilir ad', 'ad', null, a.hedef));
        } else {
          parcalar.push(girdi('Seçici', 'secici', null, a.hedef), girdi('Metni içeren', 'metin', 'İsteğe bağlı', a.hedef));
          const tam = h('input', { type: 'checkbox', id: yeniKimlik('tam'), checked: Boolean(a.hedef.tamMetin) });
          tam.addEventListener('change', () => { if (tam.checked) a.hedef.tamMetin = true; else delete a.hedef.tamMetin; });
          parcalar.push(h('label', { class: 'secenek mini-secenek', for: tam.id }, tam, 'Metin birebir'));
        }
        return parcalar;
      };
      if (a.islem === 'tikla' && a.yanitBekle && a._yanitYolu === undefined) a._yanitYolu = a.yanitBekle.yol;
      switch (a.islem) {
        case 'git': govde.append(girdi('Adres', 'adres', '/yol ya da tam adres')); break;
        case 'adresBekle': govde.append(girdi('Adres deseni', 'desen', 'Düzenli ifade')); break;
        case 'kosulBekle': govde.append(girdi('Sayfa koşulu (JavaScript)', 'ifade', 'ör. window.hazir === true — yer tutucu içeremez')); break;
        case 'tikla':
          govde.append(...hedefAlanlari());
          govde.append(girdi('Beklenen yanıt yolu', '_yanitYolu', 'İsteğe bağlı: tıklamayla gelen yanıtın yolu', a));
          govde.append(girdi('Sonraki adres deseni', 'adresBekle', 'İsteğe bağlı'));
          break;
        case 'doldur': case 'sec': case 'degerBekle':
          govde.append(...hedefAlanlari(), girdi(a.islem === 'degerBekle' ? 'Beklenen değer' : 'Değer', 'deger', '{alan} yer tutucusu kullanılabilir'));
          break;
        case 'sayiBekle': govde.append(...hedefAlanlari(), girdi('Beklenen sayı', 'sayi')); break;
        case 'metinBekle': govde.append(...hedefAlanlari(), girdi('Beklenen metin', 'metin')); break;
        default: govde.append(...hedefAlanlari());
      }
      const tasi = (yon) => { const j = i + yon; if (j < 0 || j >= adimlar.length) return; [adimlar[i], adimlar[j]] = [adimlar[j], adimlar[i]]; adimlariCiz(); };
      return h('li', { class: 'tarif-adim' },
        h('div', { class: 'tarif-adim-ust' }, h('span', { class: 'tarif-adim-no sayi', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')), islem,
          girdi('Açıklama', 'aciklama', null),
          h('div', { class: 'tarif-adim-eylemleri' },
            h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `Adım ${i + 1}: yukarı taşı`, disabled: i === 0, onclick: () => tasi(-1) }, ikon('asagi', 'yukari')),
            h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `Adım ${i + 1}: aşağı taşı`, disabled: i === adimlar.length - 1, onclick: () => tasi(1) }, ikon('asagi')),
            h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `Adım ${i + 1}: kaldır`, onclick: () => { adimlar.splice(i, 1); adimlariCiz(); } }, ikon('cop')))),
        govde);
    };
    adimlariCiz();
    const adimEkle = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('arti'), 'Adım ekle');
    adimEkle.addEventListener('click', () => { adimlar.push({ islem: 'tikla', hedef: { secici: '' } }); adimlariCiz(); });
    const baglamAlani = h('div', { class: 'ic-alanlar' },
      alan('Bağlam türü', baglamTuru, { yardim: 'Adımlardaki {alan} yer tutucuları bu türdeki seçilen bağlam profilinin alanlarıyla doldurulur.' }),
      h('datalist', { id: turListesiId }, veri.baglamTurleri.map((x) => h('option', { value: x.tur }))),
      alanCipleri,
      h('details', { class: 'tarif-adim-kutusu', open: adimlar.length <= 6 },
        h('summary', {}, adimOzetMetni), adimListesi, h('div', { class: 'dugmeler' }, adimEkle)));
    const baglamGorunum = () => { baglamAlani.hidden = !baglamVar.checked; };
    baglamVar.addEventListener('change', baglamGorunum);
    baglamGorunum();

    // --- Toplama + kaydetme ---------------------------------------------------------------
    const topla = () => {
      const tur = rTotp.r.checked ? 'totp' : rSms.r.checked ? 'sms' : 'yok';
      return {
        girisAdresi: girisAdresi.value.trim() || '/',
        oturumKontrolAdresi: oturumAdresi.value.trim(),
        kullaniciAlani: kullanici.value.trim(),
        parolaAlani: parola.value.trim(),
        gonderDugmesi: gonder.value.trim(),
        basariGostergesi: { tur: basariTur.value, deger: basariDeger.value.trim() },
        hataGostergeleri: hataSatirlari.map((s) => ({ tur: s.tur.value, deger: s.deger.value.trim() })).filter((g) => g.deger),
        zamanAsimiSn: Number(zamanAsimi.value) || 45,
        ikinciAdim: tur === 'yok' ? { tur } : {
          tur, kodAlani: kodAlani.value.trim(), gonderDugmesi: kodGonder.value.trim(),
          smsKipi: tur === 'sms' ? (sSabit.r.checked ? 'sabit' : sElle.r.checked ? 'elle' : null) : null,
          hataGostergeleri: ikinci.hataGostergeleri || [], elleBeklemeSn: Number(elleSure.value) || 180
        },
        baglamDegistirme: baglamVar.checked ? {
          baglamTuru: baglamTuru.value.trim(),
          adimlar: adimlar.map((a) => {
            const { _yanitYolu, ...kalan } = a;
            if (a.islem === 'tikla') {
              if (_yanitYolu !== undefined) { if (String(_yanitYolu).trim()) kalan.yanitBekle = { yol: String(_yanitYolu).trim() }; else delete kalan.yanitBekle; }
              if (kalan.adresBekle !== undefined && !String(kalan.adresBekle).trim()) delete kalan.adresBekle;
            }
            if (kalan.aciklama !== undefined && !String(kalan.aciklama).trim()) delete kalan.aciklama;
            if (kalan.hedef && 'metin' in kalan.hedef && !String(kalan.hedef.metin).trim()) delete kalan.hedef.metin;
            if (a.islem === 'sayiBekle') kalan.sayi = Number(kalan.sayi);
            return kalan;
          })
        } : null
      };
    };
    const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Tarifi kaydet');
    const sifirla = o.kaynak === 'kayitli'
      ? h('button', { type: 'button', class: 'hayalet' }, ikon('geri'), o.varsayilanVar ? 'Proje varsayılanına dön' : 'Kayıtlı tarifi sil')
      : null;
    const form = h('form', { class: 'kart form-paneli tarif-formu', novalidate: true },
      h('h3', {}, `Giriş tarifi: ${o.ortamAd}`),
      h('p', { class: 'soluk kucuk' }, h('span', { class: 'mono' }, o.tabanUrl), ' — tarifte parola ya da kod yoktur; onlar giriş profilinde şifreli durur.'),
      mesaj.kutu,
      h('fieldset', {}, h('legend', {}, 'Giriş sayfası'),
        h('div', { class: 'iki-sutun' },
          alan('Giriş adresi', girisAdresi, { yardim: 'Taban adrese göre yol (ör. / ya da /giris) veya tam http(s) adresi.' }),
          alan('Oturum kontrol adresi', oturumAdresi, { yardim: 'Kayıtlı oturumun geçerliliğine bakılan sayfa (boşsa giriş adresi).' })),
        h('div', { class: 'oneri-satiri' }, oner,
          h('span', { class: 'soluk kucuk' }, ikon('uyari'), ' Ortamın adresini bu bilgisayarda açar; yalnızca siz basınca çalışır.')),
        oneriNotu,
        alan('Kullanıcı adı alanı', kullanici, { zorunlu: true, yardim: SECICI_YARDIMI }),
        alan('Parola alanı', parola, { zorunlu: true }),
        alan('Giriş düğmesi', gonder, { zorunlu: true, yardim: 'Form düğmesi, input[type=submit] ya da görüntü düğmesi (input[type=image]).' })),
      h('fieldset', {}, h('legend', {}, 'Sonuç göstergeleri'),
        h('div', { class: 'iki-sutun' }, alan('Başarı göstergesi türü', basariTur), alan('Başarı göstergesi', basariDeger, { zorunlu: true, yardim: 'Girişten sonra görünen metin (ör. "Oturumu Kapat"), adres deseni ya da öğe.' })),
        h('div', { class: 'alan' }, h('label', {}, 'Hata göstergeleri'),
          h('div', { class: 'yardim' }, 'Görünürse “kullanıcı adı veya parola hatalı” sayılır ve giriş beklemeden durur (ör. hata penceresindeki metin).'),
          hataKutusu, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => hataEkle() }, ikon('arti'), 'Hata göstergesi ekle')),
        alan('Giriş bekleme süresi (sn)', zamanAsimi, { yardim: 'Giriş düğmesinden sonra başarı/hata göstergesi için beklenen süre (5–600).' })),
      h('fieldset', {}, h('legend', {}, 'İki aşamalı doğrulama'),
        h('div', { role: 'radiogroup', 'aria-label': 'İkinci adım türü' }, rYok.etiket, rTotp.etiket, rSms.etiket),
        kodAlanlari),
      h('fieldset', {}, h('legend', {}, 'Bağlam değiştirme (isteğe bağlı)'),
        h('label', { class: 'secenek', for: baglamVar.id }, baglamVar, 'Girişten sonra bağlam seç (rol, şube, acente…)'),
        baglamAlani),
      h('div', { class: 'dugmeler' }, kaydet, sifirla, h('button', { type: 'button', class: 'hayalet', onclick: () => formAlani.replaceChildren() }, 'Vazgeç')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      mesaj.temizle();
      [kullanici, parola, gonder, basariDeger].forEach((g) => alanHatasi(g, ''));
      const zorunlu = [[kullanici, 'Kullanıcı adı alanı boş olamaz.'], [parola, 'Parola alanı boş olamaz.'], [gonder, 'Giriş düğmesi boş olamaz.'], [basariDeger, 'Başarı göstergesi boş olamaz.']];
      for (const [g, m] of zorunlu) if (!g.value.trim()) { alanHatasi(g, m); g.focus(); return; }
      try {
        const { tarif } = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/giris-tarifi/kaydet', { govde: { projeId: proje.id, ortamId: o.ortamId, tarif: topla() } }));
        bildir('Giriş tarifi kaydedildi.');
        guncelle(tarif);
        formAlani.replaceChildren();
      } catch (hata) { mesaj.goster(hata.message); }
    });
    if (sifirla) {
      sifirla.addEventListener('click', async () => {
        const tamam = await onayIste(o.varsayilanVar
          ? { baslik: 'Proje varsayılanına dönülsün mü?', metin: `${o.ortamAd} ortamının kaydedilmiş giriş tarifi silinir; projenin varsayılan tarifi kullanılır.`, dugme: 'Varsayılana dön' }
          : { baslik: 'Kayıtlı tarif silinsin mi?', metin: `${o.ortamAd} ortamının giriş tarifi silinir; tarif yeniden tanımlanana kadar bu ortamda giriş yapılamaz.`, dugme: 'Tarifi sil', tehlikeli: true });
        if (!tamam) return;
        try {
          const { tarif } = await api('/platform/giris-tarifi/sifirla', { govde: { projeId: proje.id, ortamId: o.ortamId } });
          bildir('Proje varsayılanına dönüldü.');
          guncelle(tarif);
          formAlani.replaceChildren();
        } catch (hata) { mesaj.goster(hata.message); }
      });
    }
    formAlani.replaceChildren(form);
    girisAdresi.focus();
    form.scrollIntoView({ block: 'nearest' });
  };

  ciz();
  kapsayici.replaceChildren(
    h('div', { class: 'bolum-basligi' }, h('h3', {}, 'Giriş tarifi', rozet(String(veri.ortamlar.length)))),
    h('p', { class: 'soluk kucuk bolum-aciklamasi' }, 'Testlerin giriş sayfasını nasıl kullanacağı (alanlar, başarı/hata göstergeleri, iki aşamalı doğrulama ve bağlam seçimi) ortam başına burada tanımlanır.'),
    formAlani,
    veri.ortamlar.length ? liste : bosDurum('Henüz ortam yok.', 'Önce Proje ve ortamlar bölümünden bir ortam ekleyin.', { ikon: 'ag', rol: 'status' }));
}
