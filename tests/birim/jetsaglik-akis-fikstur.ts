// YEREL FİKSTÜR — JetSağlık benzeri yeni iş ekranı (girişsiz; 127.0.0.1). "JetSağlık (akış)" paketinin
// (projeler/galaksi/jetsaglik-akis.mjs) model koşucusuyla uçtan uca denenmesi içindir. Seçiciler ve davranış JetSağlık
// POM'undakilerle aynıdır: sigortalı tipi radyoları (gizli çizimli; yabancı kimlik "Özel" tipte), acentenin varsayılan telefonuyla
// açılan telefon alanı, tipe göre görünen doğum tarihi / yabancı kimlik no (#QueryIdentity) ya da uyruk / pasaport no
// (#QueryPassportNumber) ve sorgudan sonra açılan pasaport ayrıntıları, sorgu bitince telefonun kayıtlı ESKİ numarayla yeniden
// yazılması (POM notu), sorgudan sonra açılan poliçe bölümü (#PolicyDetail), sigorta ettiren (kendisi / farklı özel / tüzel /
// pasaport — pasaportta telefon satırı GİZLİ), yabancı kimlikte sorgudan gelen eksik adres (belde "-1", mahalle / cadde boş),
// il → ilçe → belde listelerinin gecikmeli yüklenmesi, poliçe listeleri (#Yenileme GİZLİ), "Hesapla" → prim ve "Poliçeleştir"
// → kart formu DOĞRUDAN (JetSağlık; ara "KREDİ KARTI İLE POLİÇELEŞTİR" bağlantısı yok — POM notu).
// İl / ilçe / belde uçları (/ajx-ilce, /ajx-belde) fikstüre özeldir. Şirket sitesine hiçbir istek gitmez.
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

export const SAGLIK_YOLU = '/jet-satis/jet-saglik/';
/** Ödeme sonucu (TEST'te test kartıyla poliçe kesilmez). */
export const SAGLIK_ODEME_SONUCU = 'Hiçbir poliçe onaylanamadı.';
/** Acente kaydındaki varsayılan telefon (ekran açılınca gelir) ve sorgunun yeniden yazdığı kayıtlı eski telefon. */
export const SAGLIK_ACENTE_TELEFONU = '5009990000';
export const SAGLIK_ESKI_TELEFON = '5001112233';
/** Liste seçenekleri (fikstürün; gerçek ekranın listeleri TEST'ten okunacak). */
export const SAGLIK_LISTELERI: Record<string, Array<[string, string]>> = {
  Nationality: [['DE', 'ALMANYA'], ['FR', 'FRANSA']],
  ClientNationality: [['DE', 'ALMANYA'], ['FR', 'FRANSA']],
  IL: [['-1', 'Seçiniz'], ['34', 'İSTANBUL'], ['6', 'ANKARA']],
  STAPSelector: [['1', 'Apartman'], ['2', 'Site']],
  // TEST ekranındaki değerler (2026-09-26).
  slPolicyPeriod: [['1', 'İlk Yıl'], ['2', 'İkinci Yıl']],
  slHaveDisease: [['H', 'Hayır'], ['E', 'Evet']],
  KVKKOnay: [['E', 'Evet'], ['H', 'Hayır']],
  Yenileme: [['H', 'Hayır'], ['E', 'Evet']]
};
const ILCELER: Record<string, Array<[string, string]>> = { '34': [['1103', 'KADIKÖY'], ['1183', 'ÜSKÜDAR']], '6': [['1130', 'ÇANKAYA']] };
const BELDELER: Array<[string, string]> = [['-1', 'Seçiniz'], ['1', 'MERKEZ'], ['2', 'KÖY']];

export type SaglikHesaplamasi = Record<string, unknown>;

const html = (govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>JetSağlık</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0}[hidden]{display:none!important}.radyo{position:relative;display:inline-block;margin-right:12px}
.radyo input{position:absolute;opacity:0;width:14px;height:14px;margin:0}.radyo span{padding-left:18px}</style></head><body>${govde}</body></html>`
});
const json = (veri: unknown): FiksturYaniti => ({ tur: 'application/json', govde: JSON.stringify(veri) });
const secenekler = (l: Array<[string, string]>): string => l.map(([d, m]) => `<option value="${d}">${m}</option>`).join('');

export class SaglikUygulamasi {
  readonly hesaplamalar: SaglikHesaplamasi[] = [];
  readonly odemeler: Array<Record<string, unknown>> = [];
  readonly olaylar: string[] = [];

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.olaylar.push(`${i.yontem} ${i.yol}`);
    if (i.yol === SAGLIK_YOLU || i.yol === SAGLIK_YOLU.slice(0, -1)) return this.sayfa();
    if (i.yol === '/ajx-kimlikno') {
      const no = i.sorgu.get('no') ?? '';
      const tel = (i.sorgu.get('tel') ?? '').replace(/\D/g, '');
      // Kodlu testteki gibi: telefon olmadan sorgu reddedilir.
      if (!no || !tel) return json({ Status: false, Data: 'Telefon ve kimlik no zorunludur.' });
      return json({ Status: true, Data: i.sorgu.get('tip') === 'T' ? `UNVAN ${no.slice(-3)} A.Ş.` : `KİŞİ ${no.slice(-3)}` });
    }
    if (i.yol === '/ajx-passport') return json({ Status: Boolean(i.sorgu.get('no')), Data: null });
    if (i.yol === '/ajx-ilce') return json({ Status: true, Data: ILCELER[i.sorgu.get('il') ?? ''] ?? [] });
    if (i.yol === '/ajx-belde') return json({ Status: true, Data: BELDELER });
    if (i.yol === '/jet-satis/jet-saglik/policelestir' && i.yontem === 'POST') {
      this.odemeler.push(JSON.parse(i.govde || '{}') as Record<string, unknown>);
      return json({ Status: false, Data: SAGLIK_ODEME_SONUCU });
    }
    if (i.yol === '/jet-satis/jet-saglik/hesapla' && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as Record<string, unknown>;
      this.hesaplamalar.push(g);
      const adres = (g.adres ?? {}) as Record<string, unknown>;
      const eksik = !g.ad || adres.belde === '-1' || !adres.mahalle || !adres.cadde || !g.sure || !g.hastalik || !g.kvkk
        || (g.farkli === 'E' && !g.ettirenAd);
      if (eksik) return json({ Status: false, Data: 'Eksik bilgi.' });
      return json({ Status: true, Data: { prim: '1.234,50' } });
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  private sayfa(): FiksturYaniti {
    const radyo = (ad: string, deger: string, metin: string, secili = false) =>
      `<label class="radyo"><input type="radio" name="${ad}" id="${ad}-${deger}" value="${deger}"${secili ? ' checked' : ''}><span>${metin}</span></label>`;
    const liste = (id: string, etiket: string, ek = '') =>
      `<label${ek}>${etiket} <select id="${id}">${secenekler(SAGLIK_LISTELERI[id] ?? [])}</select></label>`;
    const pasaport = (o: string) => `
        <label>Ad <input id="${o}Firstname"></label><label>Soyad <input id="${o}Lastname"></label>
        <label>Baba adı <input id="${o}FatherName"></label><label>Doğum tarihi <input id="${o}Birthday" readonly></label>
        <label>Doğum yeri <input id="${o}Birthplace"></label>${radyo(`${o}Gender`, 'E', 'Erkek')}${radyo(`${o}Gender`, 'K', 'Kadın')}`;
    return html(`<h1>JetSağlık</h1>
      <section id="sigortali"><h2>Sigortalı</h2>
        ${radyo('InsuredType', 'O', 'Özel / Yabancı kimlik', true)}${radyo('InsuredType', 'P', 'Pasaport')}
        <label>Ülke kodu <input id="MobilePhoneCountry"></label>
        <label>Cep telefonu <input id="MobilePhone" value="${SAGLIK_ACENTE_TELEFONU}"></label>
        <div id="yabanci-kutu"><label>Doğum tarihi <input id="BirthDate"></label>
          <label>Kimlik no <input id="IdentityNo"></label><button id="QueryIdentity" type="button">Sorgula</button></div>
        <div id="pasaport-kutu" hidden>${liste('Nationality', 'Uyruk')}
          <label>Pasaport no <input id="PassportNumber"></label><button id="QueryPassportNumber" type="button">Pasaport sorgula</button></div>
        <div id="pasaport-ayrinti" hidden>${pasaport('')}</div>
        <div id="IdentityDetail" hidden><span id="identity-name"></span></div>
      </section>
      <div id="PolicyDetail" hidden>
      <section id="ettiren"><h2>Sigorta ettiren</h2>
        ${radyo('DifferentClient', 'H', 'Kendisi', true)}${radyo('DifferentClient', 'E', 'Farklı')}
        <div id="client-kutu" hidden>
          ${radyo('ClientType', 'O', 'Özel', true)}${radyo('ClientType', 'T', 'Tüzel')}${radyo('ClientType', 'P', 'Pasaport')}
          <label id="client-dogum-kutu">Doğum tarihi <input id="BirthDateCL" readonly></label>
          <div id="client-tel-kutu"><label>Ülke kodu <input id="ClientMobilePhoneCountry"></label>
            <label>Cep telefonu <input id="ClientMobilePhone"></label></div>
          <div id="client-kimlik-kutu"><label>Kimlik no <input id="ClientIdentityNo"></label>
            <button id="QueryClientIdentity" type="button">Sorgula</button></div>
          <div id="ClientIdentityDetail" hidden><span id="client-identity-name"></span></div>
          <div id="client-pasaport-kutu" hidden>${liste('ClientNationality', 'Uyruk')}
            <label>Pasaport no <input id="ClientPassportNumber"></label><button id="QueryClientPassportNumber" type="button">Pasaport sorgula</button></div>
          <div id="client-pasaport-ayrinti" hidden>${pasaport('Client')}</div>
        </div>
      </section>
      <section id="adres"><h2>Adres</h2>
        ${liste('IL', 'İl')}<label>İlçe <select id="IC"></select></label><label>Belde / köy <select id="BE"></select></label>
        <label>Cadde <input id="CD"></label><label>Sokak <input id="SK"></label>${liste('STAPSelector', 'Adres tipi')}
        <label>Adres parçası <input id="STAP"></label><label>Mahalle <input id="MH"></label><label>Bina no <input id="BN"></label>
        <label>Blok <input id="BK"></label><label>Site <input id="SM"></label><label>Daire <input id="DR"></label><label>Kat <input id="KT"></label>
      </section>
      <section id="police"><h2>Poliçe</h2>
        <label>Başlangıç <input id="BeginDate" readonly></label>
        ${liste('slPolicyPeriod', 'Poliçe süresi')}${liste('slHaveDisease', 'Hastalık')}${liste('KVKKOnay', 'KVKK')}
        ${liste('Yenileme', 'Yenileme', ' hidden')}
        <label>İndirim % <input id="DiscountRate"></label>
      </section>
      <section id="islemler"><button id="Hesapla" type="button">Hesapla</button>
        <p>Toplam prim: <span id="premium-total">0,00 TL</span></p><p id="hesap-hatasi"></p>
        <button id="Policelestir" type="button" hidden>Poliçeleştir</button>
        <div id="kart-formu" hidden>
          <label>Kart üzerindeki isim <input id="isim"></label><label>Kart üzerindeki soyisim <input id="soyisim"></label>
          <label>Kart numarası <input id="kartno"></label><label>Güvenlik kodu (CVV) <input id="cvv"></label>
          <label>Ay <select id="ay">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('')}</select></label>
          <label>Yıl <select id="yil">${Array.from({ length: 11 }, (_, i) => `<option value="${2026 + i}">${2026 + i}</option>`).join('')}</select></label>
          <a href="#" id="odemeyi-tamamla">Ödemeyi tamamla</a>
        </div></section>
      </div>
      <script>
        const $ = (id) => document.getElementById(id);
        const secili = (ad) => document.querySelector('input[name=' + ad + ']:checked').value;
        const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
        const al = async (yol) => (await fetch(yol)).json();
        const doldur = (s, l) => { s.innerHTML = l.map(([d, m]) => '<option value="' + d + '">' + m + '</option>').join(''); };
        const tel = (id) => $(id).value.replace(/\\D/g, '');
        // Tip: yabancı kimlik (O) doğum tarihi + kimlik no; pasaport (P) uyruk + pasaport no.
        document.querySelectorAll('input[name=InsuredType]').forEach((r) => r.addEventListener('change', () => {
          const p = secili('InsuredType') === 'P'; $('yabanci-kutu').hidden = p; $('pasaport-kutu').hidden = !p;
        }));
        document.querySelectorAll('input[name=DifferentClient]').forEach((r) => r.addEventListener('change', () => {
          $('client-kutu').hidden = secili('DifferentClient') !== 'E';
        }));
        document.querySelectorAll('input[name=ClientType]').forEach((r) => r.addEventListener('change', () => {
          const t = secili('ClientType');
          $('client-dogum-kutu').hidden = t !== 'O'; $('client-tel-kutu').hidden = t === 'P'; // pasaportta telefon satırı gizli (POM)
          $('client-kimlik-kutu').hidden = t === 'P'; $('client-pasaport-kutu').hidden = t !== 'P';
        }));
        // İl → ilçe → belde (gecikmeli yüklenir).
        const ilceYukle = async (secilecek) => {
          const r = await al('/ajx-ilce?il=' + $('IL').value); await bekle(300);
          doldur($('IC'), [['-1', 'Seçiniz'], ...r.Data]); if (secilecek) $('IC').value = secilecek;
          $('BE').innerHTML = '';
        };
        const beldeYukle = async () => { const r = await al('/ajx-belde?ilce=' + $('IC').value); await bekle(300); doldur($('BE'), r.Data); };
        $('IL').addEventListener('change', () => ilceYukle());
        $('IC').addEventListener('change', beldeYukle);
        // Sigortalı sorgusu: kimlik alanı sorgu süresince salt okunur; bitince ayrıntı ve poliçe bölümü açılır, telefon kayıtlı
        // eski numarayla yeniden yazılır (POM notu). Yabancı kimlikte adres sorgudan EKSİK gelir (belde "-1", mahalle / cadde boş).
        $('QueryIdentity').onclick = async () => {
          $('IdentityNo').readOnly = true;
          const r = await al('/ajx-kimlikno?tip=Y&no=' + encodeURIComponent($('IdentityNo').value) + '&tel=' + tel('MobilePhone'));
          await bekle(500);
          $('IdentityNo').readOnly = false;
          $('identity-name').textContent = r.Status ? r.Data : 'Hata: ' + r.Data;
          if (!r.Status) return;
          $('IdentityDetail').hidden = false; $('MobilePhone').value = '${SAGLIK_ESKI_TELEFON}';
          $('PolicyDetail').hidden = false;
          $('IL').value = '34'; await ilceYukle('1103'); await beldeYukle(); $('BE').value = '-1';
        };
        $('QueryPassportNumber').onclick = async () => {
          const r = await al('/ajx-passport?no=' + encodeURIComponent($('PassportNumber').value));
          await bekle(500);
          if (!r.Status) return;
          $('pasaport-ayrinti').hidden = false; $('MobilePhone').value = '${SAGLIK_ESKI_TELEFON}'; $('PolicyDetail').hidden = false;
        };
        $('QueryClientIdentity').onclick = async () => {
          const r = await al('/ajx-kimlikno?tip=' + secili('ClientType') + '&no=' + encodeURIComponent($('ClientIdentityNo').value) + '&tel=' + tel('ClientMobilePhone'));
          await bekle(500);
          $('client-identity-name').textContent = r.Status ? r.Data : 'Hata: ' + r.Data;
          if (!r.Status) return;
          $('ClientIdentityDetail').hidden = false; $('ClientMobilePhone').value = '${SAGLIK_ESKI_TELEFON}';
        };
        $('QueryClientPassportNumber').onclick = async () => {
          const r = await al('/ajx-passport?no=' + encodeURIComponent($('ClientPassportNumber').value));
          await bekle(500);
          if (r.Status) $('client-pasaport-ayrinti').hidden = false;
        };
        const pasaportOku = (o) => ({ ad: $(o + 'Firstname').value, soyad: $(o + 'Lastname').value, baba: $(o + 'FatherName').value,
          dogum: $(o + 'Birthday').value, yer: $(o + 'Birthplace').value,
          cinsiyet: (document.querySelector('input[name=' + o + 'Gender]:checked') || { value: '' }).value });
        $('Hesapla').onclick = async () => {
          $('premium-total').textContent = '0,00 TL'; $('hesap-hatasi').textContent = '';
          const p = secili('InsuredType') === 'P';
          const farkli = secili('DifferentClient'); const ct = secili('ClientType');
          const govde = { sigortaliTip: secili('InsuredType'), ulkeKodu: $('MobilePhoneCountry').value, tel: tel('MobilePhone'),
            dogum: p ? null : $('BirthDate').value, yabanciNo: p ? null : $('IdentityNo').value,
            uyruk: p ? $('Nationality').value : null, pasaportNo: p ? $('PassportNumber').value : null, pasaport: p ? pasaportOku('') : null,
            ad: p ? $('Firstname').value : $('identity-name').textContent,
            farkli, ettirenTip: farkli === 'E' ? ct : null,
            ettirenUlkeKodu: farkli === 'E' ? $('ClientMobilePhoneCountry').value : null, ettirenTel: farkli === 'E' ? tel('ClientMobilePhone') : null,
            ettirenDogum: farkli === 'E' && ct === 'O' ? $('BirthDateCL').value : null,
            ettirenNo: farkli === 'E' && ct !== 'P' ? $('ClientIdentityNo').value : null,
            ettirenUyruk: farkli === 'E' && ct === 'P' ? $('ClientNationality').value : null,
            ettirenPasaportNo: farkli === 'E' && ct === 'P' ? $('ClientPassportNumber').value : null,
            ettirenPasaport: farkli === 'E' && ct === 'P' ? pasaportOku('Client') : null,
            ettirenAd: farkli !== 'E' ? null : ct === 'P' ? $('ClientFirstname').value : $('client-identity-name').textContent,
            adres: { il: $('IL').value, ilce: $('IC').value, belde: $('BE').value, cadde: $('CD').value, sokak: $('SK').value,
              adresTipi: $('STAPSelector').value, parca: $('STAP').value, mahalle: $('MH').value, binaNo: $('BN').value,
              blok: $('BK').value, site: $('SM').value, daire: $('DR').value, kat: $('KT').value },
            baslangic: $('BeginDate').value, sure: $('slPolicyPeriod').value, hastalik: $('slHaveDisease').value,
            kvkk: $('KVKKOnay').value, yenileme: $('Yenileme').value, indirim: $('DiscountRate').value };
          const r = await (await fetch('/jet-satis/jet-saglik/hesapla', { method: 'POST', body: JSON.stringify(govde) })).json();
          await bekle(200);
          if (!r.Status) { $('hesap-hatasi').textContent = r.Data; return; }
          $('premium-total').textContent = r.Data.prim + ' TL';
          $('Policelestir').hidden = false;
        };
        // JetSağlık: Poliçeleştir kart formunu DOĞRUDAN açar (ara bağlantı yok — POM).
        $('Policelestir').onclick = () => { setTimeout(() => { $('kart-formu').hidden = false; }, 150); };
        $('odemeyi-tamamla').onclick = async (o) => {
          o.preventDefault();
          const govde = { isim: $('isim').value, soyisim: $('soyisim').value, kartNo: $('kartno').value, cvv: $('cvv').value, ay: $('ay').value, yil: $('yil').value };
          const r = await (await fetch('/jet-satis/jet-saglik/policelestir', { method: 'POST', body: JSON.stringify(govde) })).json();
          setTimeout(() => alert(r.Data), 200);
        };
      </script>`);
  }
}
