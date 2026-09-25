// YEREL FİKSTÜR — JetKasko YK (yeni kayıt) benzeri ekran (girişsiz; 127.0.0.1). "JetKasko (akış)" paketinin
// (projeler/galaksi/jetkasko-akis.mjs) model koşucusuyla uçtan uca denenmesi içindir. Seçiciler ve davranış JetKasko
// POM'undakilerle aynıdır: sigortalı tipi radyoları (tüzelde doğum tarihi gizlenir), telefon + plaka ("YK" değilse sorgu
// hata penceresi açar), yeşil "Sorgula" (#QueryVehicle; yükleme perdesiyle, sonra araç bilgileri açılır), sigorta ettiren
// (kendisi / farklı özel / farklı tüzel; #RefreshClientIdentity sorgusu ad alanını gecikmeli doldurur), model yılı bırakılınca
// yüklenen marka listesi, marka kodu sorgusu (#VehicleModel kendiliğinden seçilir), araç tipine göre YAVAŞ (1,5 sn) yeniden
// yüklenen sınıf listesi, yetkili indirimi (%20'den büyükse prim hesaplama hata penceresi), "Hesapla" → ürün radyoları
// (KaskoTur) kademeli gelir ve "value"ları her hesaplamada karışır; "Poliçeleştir" → kredi kartı ödemesi.
// Şirket sitesine hiçbir istek gitmez.
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

export const KASKO_YOLU = '/jet-satis/jet-kasko/';
/** Ödeme sonucu (TEST'te test kartıyla poliçe kesilmez). */
export const KASKO_ODEME_SONUCU = 'Hiçbir poliçe onaylanamadı.';
/** Prim hesaplamanın iş kuralı hatası (fikstürün; yetkili indirimi %20'den büyükse). */
export const KASKO_INDIRIM_HATASI = "Yetkili indirimi %20'yi geçemez.";
/** Ürünler (POM JETKASKO_URUN_KODLARI ile aynı adlar). */
export const KASKO_URUNLERI = [
  'GENİŞLETİLMİŞ KASKO(İKAME+YOL YARD.)', 'MAVİ KASKO(Dar)', 'GÜLÜMSETEN KASKO(YOL YARD.)',
  'GENİŞLETİLMİŞ KASKO(YOL YARD.)', 'GÜLÜMSETEN KASKO(İKAME+YOL YARD.)'
];
/** Liste seçenekleri (fikstürün; gerçek ekranın listeleri TEST'ten okunacak). Sınıf listesi araç tipine bağlıdır. */
export const KASKO_LISTELERI: Record<string, Array<[string, string]>> = {
  VehicleType: [['1', 'Otomobil'], ['2', 'Kamyon']],
  UsageType: [['1', 'Hususi'], ['2', 'Ticari']]
};
export const KASKO_SINIFLARI: Record<string, Array<[string, string]>> = {
  1: [['11', 'Otomobil (Binek)']],
  2: [['21', 'Kamyon (0-10 Ton)'], ['22', 'Kamyon (10+ Ton)']]
};

export type KaskoHesaplamasi = Record<string, unknown>;

const html = (govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>JetKasko</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0}.radyo{position:relative;display:inline-block;margin-right:12px}
.radyo input{position:absolute;opacity:0;width:14px;height:14px;margin:0}.radyo span{padding-left:18px}
.blockUI.blockOverlay{position:fixed;inset:0;background:rgba(0,0,0,.15)}.ui-dialog{border:1px solid #c00;padding:8px}</style></head><body>${govde}</body></html>`
});
const json = (veri: unknown): FiksturYaniti => ({ tur: 'application/json', govde: JSON.stringify(veri) });

export class KaskoUygulamasi {
  readonly hesaplamalar: KaskoHesaplamasi[] = [];
  readonly odemeler: Array<Record<string, unknown>> = [];
  readonly sorgular: Array<Record<string, string>> = [];
  readonly olaylar: string[] = [];

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.olaylar.push(`${i.yontem} ${i.yol}`);
    if (i.yol === KASKO_YOLU || i.yol === KASKO_YOLU.slice(0, -1)) return this.sayfa();
    const q = (ad: string): string => i.sorgu.get(ad) ?? '';
    if (i.yol === '/jet-satis/jet-kasko/ajx-sigortali') {
      this.sorgular.push({ tur: 'sigortali', tip: q('tip'), no: q('no'), dogum: q('dogum'), tel: q('tel'), il: q('il'), plaka: q('plaka') });
      // Kodlu testteki gibi: telefon ya da kimlik yoksa, plaka "YK" değilse sorgu reddedilir.
      if (!q('no') || !q('tel')) return json({ Status: false, Data: 'Telefon ve kimlik no zorunludur.' });
      if (q('plaka').toUpperCase() !== 'YK') return json({ Status: false, Data: 'Tescil belge seri no giriniz.' });
      return { ...json({ Status: true, Data: q('tip') === 'T' ? `UNVAN ${q('no').slice(-3)} A.Ş.` : `KİŞİ ${q('no').slice(-3)}` }), gecikmeMs: 400 };
    }
    if (i.yol === '/jet-satis/jet-kasko/ajx-ettiren') {
      this.sorgular.push({ tur: 'ettiren', tip: q('tip'), no: q('no'), dogum: q('dogum'), tel: q('tel') });
      if (!q('no') || !q('tel') || (q('tip') === 'O' && !q('dogum'))) return json({ Status: false, Data: 'Sigorta ettiren bilgileri eksik.' });
      return json({ Status: true, Data: q('tip') === 'T' ? `ETTİREN UNVAN ${q('no').slice(-3)}` : `ETTİREN KİŞİ ${q('no').slice(-3)}` });
    }
    if (i.yol === '/jet-satis/jet-kasko/ajx-marka-listesi') return { ...json([['M1', 'MARKA 1'], ['M2', 'MARKA 2']]), gecikmeMs: 500 };
    if (i.yol === '/jet-satis/jet-kasko/ajx-marka-kodu') {
      const kod = q('kod');
      if (!/^\d{3,}$/.test(kod)) return json({ Status: false, Data: 'Marka kodu bulunamadı.' });
      return { ...json({ Status: true, Data: { marka: kod.slice(0, 3), model: kod } }), gecikmeMs: 300 };
    }
    // Bağımlı liste: araç tipine göre sınıflar (yavaş sunucu; beklenmezse sonraki sınıf seçimi boşa gider).
    if (i.yol === '/jet-satis/jet-kasko/ajx-sinif') return { ...json(KASKO_SINIFLARI[q('tip')] ?? []), gecikmeMs: 1500 };
    if (i.yol === '/jet-satis/jet-kasko/hesapla' && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as Record<string, unknown>;
      this.hesaplamalar.push(g);
      if (Number(g.indirim || 0) > 20) return json({ Status: false, Data: KASKO_INDIRIM_HATASI });
      if (!g.ad || !g.model || !g.sinif || !g.tescil) return json({ Status: false, Data: 'Eksik bilgi.' });
      return json({ Status: true });
    }
    if (i.yol === '/jet-satis/jet-kasko/odeme' && i.yontem === 'POST') {
      this.odemeler.push(JSON.parse(i.govde || '{}') as Record<string, unknown>);
      return json({ mesaj: KASKO_ODEME_SONUCU });
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  private sayfa(): FiksturYaniti {
    const radyo = (ad: string, deger: string, metin: string, secili = false) =>
      `<label class="radyo"><input type="radio" name="${ad}" id="${ad}-${deger}" value="${deger}"${secili ? ' checked' : ''}><span>${metin}</span></label>`;
    const liste = (id: string, etiket: string) =>
      `<label>${etiket} <select id="${id}"><option value="">Seçiniz</option>${(KASKO_LISTELERI[id] ?? []).map(([d, m]) => `<option value="${d}">${m}</option>`).join('')}</select></label>`;
    return html(`<h1>JetKasko</h1>
      <section id="sigortali"><h2>Sigortalı</h2>
        ${radyo('InsuredType', 'O', 'Özel', true)}${radyo('InsuredType', 'T', 'Tüzel')}
        <label>Kimlik no <input id="IdentityNo"></label>
        <label id="dogum-kutu">Doğum tarihi <input id="BirthDate"></label>
        <label>Cep telefonu <input id="PhoneNumber"></label>
        <label>Plaka il kodu <input id="PlateCity"></label><label>Plaka no <input id="PlateNo"></label>
        <button id="QueryVehicle" type="button">Sorgula</button> <span id="insured-name"></span>
      </section>
      <section id="arac-bolumu" hidden><h2>Sigorta ettiren</h2>
        ${radyo('DifferentClient', 'H', 'Sigortalı')}${radyo('DifferentClient', 'E', 'Farklı')}
        <div id="ettiren-kutu" hidden>
          ${radyo('ClientType', 'O', 'Özel', true)}${radyo('ClientType', 'T', 'Tüzel')}
          <label id="ettiren-dogum-kutu">Doğum tarihi <input id="ClientBirthDate"></label>
          <label>Cep telefonu <input id="ClientPhoneNumber"></label>
          <label>Kimlik no <input id="ClientIdentityNo"></label><button id="RefreshClientIdentity" type="button">Sorgula</button>
          <span id="client-identity-name"></span>
        </div>
        <h2>Araç bilgileri</h2>
        <label>Model yılı <input id="ModelYear"></label>
        <label>Marka <select id="VehicleBrand"><option value="">Seçiniz</option></select></label>
        <label>Marka kodu <input id="VehicleModelCode"></label><button id="QueryVehicleModelCode" type="button">Kod sorgula</button>
        <label>Model <select id="VehicleModel"><option value="">Seçiniz</option></select></label>
        <label>Motor no <input id="EngineNo"></label><label>Şasi no <input id="ChassisNo"></label>
        <label>Tescil tarihi <input id="RegistrationDate"></label>
        ${liste('VehicleType', 'Araç tipi')}
        <label>Sınıf <select id="TariffClass"><option value="">Seçiniz</option></select></label>
        ${liste('UsageType', 'Kullanım')}
        <label>Yetkili indirimi % <input id="AuthorizedDiscount"></label>
        <button id="Hesapla" type="button">Hesapla</button>
        <div id="urunler"></div>
        <button id="Policelestir" type="button" hidden>Teklifi Kaydet</button>
        <div id="fancybox-wrap" hidden><a href="#" id="kart-baglantisi">KREDİ KARTI İLE POLİÇELEŞTİR</a></div>
        <div id="kart-formu" hidden>
          <label>Kart üzerindeki isim <input id="isim"></label><label>Kart üzerindeki soyisim <input id="soyisim"></label>
          <label>Kart numarası <input id="kartno"></label><label>Güvenlik kodu (CVV) <input id="cvv"></label>
          <label>Ay <select id="ay">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('')}</select></label>
          <label>Yıl <select id="yil">${Array.from({ length: 11 }, (_, i) => `<option value="${2026 + i}">${2026 + i}</option>`).join('')}</select></label>
          <a href="#" id="odemeyi-tamamla">Ödemeyi tamamla</a>
        </div>
      </section>
      <div class="ui-dialog" id="hata-penceresi" hidden><span id="hata-metni"></span> <a href="#" id="hata-tamam">Tamam</a></div>
      <div class="blockUI blockOverlay" hidden></div>
      <script>
        const $ = (id) => document.getElementById(id);
        const secili = (ad) => (document.querySelector('input[name=' + ad + ']:checked') || {}).value || '';
        const perde = (acik) => { document.querySelector('.blockUI').hidden = !acik; };
        const hata = (m) => { $('hata-metni').textContent = m; $('hata-penceresi').hidden = false; };
        $('hata-tamam').onclick = (o) => { o.preventDefault(); $('hata-penceresi').hidden = true; };
        const getir = async (yol, p) => (await fetch('/jet-satis/jet-kasko/' + yol + '?' + new URLSearchParams(p))).json();
        document.querySelectorAll('input[name=InsuredType]').forEach((r) => r.addEventListener('change', () => { $('dogum-kutu').hidden = secili('InsuredType') === 'T'; }));
        document.querySelectorAll('input[name=DifferentClient]').forEach((r) => r.addEventListener('change', () => { $('ettiren-kutu').hidden = secili('DifferentClient') !== 'E'; }));
        document.querySelectorAll('input[name=ClientType]').forEach((r) => r.addEventListener('change', () => { $('ettiren-dogum-kutu').hidden = secili('ClientType') === 'T'; }));
        $('QueryVehicle').onclick = async () => {
          perde(true);
          const t = secili('InsuredType');
          const r = await getir('ajx-sigortali', { tip: t, no: $('IdentityNo').value, dogum: t === 'T' ? '' : $('BirthDate').value, tel: $('PhoneNumber').value, il: $('PlateCity').value, plaka: $('PlateNo').value });
          setTimeout(() => {
            perde(false);
            if (!r.Status) { hata(r.Data); return; }
            $('insured-name').textContent = r.Data; $('arac-bolumu').hidden = false;
          }, 300);
        };
        $('RefreshClientIdentity').onclick = async () => {
          const t = secili('ClientType');
          const r = await getir('ajx-ettiren', { tip: t, no: $('ClientIdentityNo').value, dogum: t === 'T' ? '' : $('ClientBirthDate').value, tel: $('ClientPhoneNumber').value });
          setTimeout(() => { if (r.Status) $('client-identity-name').textContent = r.Data; else hata(r.Data); }, 500);
        };
        // Marka listesi yalnızca model yılı alanı BIRAKILINCA yüklenir (POM: Tab).
        $('ModelYear').addEventListener('blur', async () => {
          const l = await getir('ajx-marka-listesi', { yil: $('ModelYear').value });
          $('VehicleBrand').length = 1; for (const [d, m] of l) $('VehicleBrand').add(new Option(m, d));
        });
        $('QueryVehicleModelCode').onclick = async () => {
          const r = await getir('ajx-marka-kodu', { kod: $('VehicleModelCode').value });
          setTimeout(() => {
            if (!r.Status) { hata(r.Data); return; }
            $('VehicleBrand').add(new Option('MARKA ' + r.Data.marka, r.Data.marka)); $('VehicleBrand').value = r.Data.marka;
            $('VehicleModel').length = 1; $('VehicleModel').add(new Option('MODEL ' + r.Data.model, r.Data.model)); $('VehicleModel').value = r.Data.model;
          }, 300);
        };
        $('VehicleType').addEventListener('change', async () => {
          $('TariffClass').length = 1;
          const l = await getir('ajx-sinif', { tip: $('VehicleType').value });
          $('TariffClass').length = 1; for (const [d, m] of l) $('TariffClass').add(new Option(m, d));
        });
        // Ürünler kademeli gelir; radyo "value"ları her hesaplamada farklıdır (POM: seçim ada göre yapılmalı).
        const URUNLER = ${JSON.stringify(KASKO_URUNLERI)};
        let hesapSayaci = 0;
        $('Hesapla').onclick = async () => {
          $('urunler').innerHTML = ''; $('Policelestir').hidden = true; perde(true);
          const t = secili('InsuredType'); const e = secili('DifferentClient');
          const govde = { tip: t, no: $('IdentityNo').value, dogum: t === 'T' ? null : $('BirthDate').value, tel: $('PhoneNumber').value,
            il: $('PlateCity').value, plaka: $('PlateNo').value, ad: $('insured-name').textContent, ettiren: e,
            ettirenTipi: e === 'E' ? secili('ClientType') : null, ettirenNo: e === 'E' ? $('ClientIdentityNo').value : null,
            ettirenAd: e === 'E' ? $('client-identity-name').textContent : null, modelYili: $('ModelYear').value, marka: $('VehicleBrand').value,
            model: $('VehicleModel').value, motor: $('EngineNo').value, sasi: $('ChassisNo').value, tescil: $('RegistrationDate').value,
            aracTipi: $('VehicleType').value, sinif: $('TariffClass').value, kullanim: $('UsageType').value, indirim: $('AuthorizedDiscount').value };
          const r = await (await fetch('/jet-satis/jet-kasko/hesapla', { method: 'POST', body: JSON.stringify(govde) })).json();
          await new Promise((c) => setTimeout(c, 300));
          perde(false);
          if (!r.Status) { hata(r.Data); return; }
          hesapSayaci += 1;
          URUNLER.forEach((ad, i) => setTimeout(() => {
            const deger = String(((i + hesapSayaci) % URUNLER.length) + 1);
            $('urunler').insertAdjacentHTML('beforeend', '<label><input type="radio" name="KaskoTur" value="' + deger + '"> ' + ad + '</label>');
            if (i === URUNLER.length - 1) $('Policelestir').hidden = false;
          }, 300 + i * 1500));
        };
        $('Policelestir').onclick = () => { setTimeout(() => { $('fancybox-wrap').hidden = false; }, 150); };
        $('kart-baglantisi').onclick = (o) => { o.preventDefault(); $('fancybox-wrap').hidden = true; $('kart-formu').hidden = false; };
        $('odemeyi-tamamla').onclick = async (o) => {
          o.preventDefault();
          const u = document.querySelector('input[name=KaskoTur]:checked');
          const govde = { urun: u ? u.parentElement.textContent.trim() : null, urunDegeri: u ? u.value : null,
            isim: $('isim').value, soyisim: $('soyisim').value, kartNo: $('kartno').value, cvv: $('cvv').value, ay: $('ay').value, yil: $('yil').value };
          const r = await (await fetch('/jet-satis/jet-kasko/odeme', { method: 'POST', body: JSON.stringify(govde) })).json();
          setTimeout(() => alert(r.mesaj), 200);
        };
      </script>`);
  }
}
