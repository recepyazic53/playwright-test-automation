// PENCERE YÖNETİCİSİ — aynı anda tek pencere. Rehber kartı (rehber.js), genel tanıtım ve işlem / onay pencereleri (<dialog>) üst
// üste açılmaz. Tüm pencereler tek yerden geçer: HTMLDialogElement.showModal bir kez sarılır (çağıran kodlar değişmez).
//   - İşlem penceresi açılırken rehber açıksa rehber kapanır ("görüldü" sayılmaz).
//   - Rehber, bir işlem penceresi açıkken başlamaz: rehber.js bunu acikPencereVar() ile sorar ve rehberi sıraya alır (pencere
//     kapanınca kendiliğinden başlamaz; sayfadaki "Bu sayfanın rehberi" bağlantısı kalır).
//   - Bir pencere açıkken ikinci bir pencere:
//       * açık pencerenin İÇİNDEN istendiyse (kullanıcının son tıklaması / tuşu o penceredeydi; ör. "Sil" → onay) ya da
//         karar penceresiyse (data-pencere="karar": izin ve CANLI onayı — işlem yanıtı bekler) hemen, üstte açılır;
//       * başka yerden (zamanlayıcı, geç gelen yanıt, açılış uyarısı) istendiyse SIRAYA girer ve açık pencereler kapanınca açılır.
//     Sırada bekleyen pencere kapatılır (close) ya da sayfadan kaldırılırsa sıradan düşer.

/** @type {HTMLDialogElement[]} */
const sira = [];
/** @type {((goruldu: boolean) => void) | null} */
let rehberKapatici = null;
/** Kullanıcının son etkileşimi (tıklama / tuş) hangi öğedeydi. @type {EventTarget | null} */
let sonEtkilesim = null;

/** Açık (modal) işlem pencereleri. */
function acikPencereler() {
  return /** @type {HTMLDialogElement[]} */ ([...document.querySelectorAll('dialog[open]')]);
}

/** Bir işlem penceresi açık mı (rehber bu durumda başlamaz). */
export function acikPencereVar() { return acikPencereler().length > 0; }

/**
 * Rehber kartı açıldı: işlem penceresi açılırsa çağrılacak kapatıcı. Dönen işlev kaydı siler (rehber kapanınca).
 * @param {(goruldu: boolean) => void} kapat @returns {() => void}
 */
export function rehberPenceresiKaydet(kapat) {
  rehberKapatici = kapat;
  return () => { if (rehberKapatici === kapat) rehberKapatici = null; };
}

/** @param {HTMLDialogElement} yeni @param {HTMLDialogElement[]} aciklar */
function hemenAcilabilir(yeni, aciklar) {
  if (yeni.dataset.pencere === 'karar') return true;
  const hedef = sonEtkilesim instanceof Node ? sonEtkilesim : null;
  return Boolean(hedef && hedef.isConnected && aciklar.some((d) => d.contains(hedef)));
}

function siradakiniAc() {
  if (acikPencereVar()) return;
  while (sira.length) {
    const d = /** @type {HTMLDialogElement} */ (sira.shift());
    if (!d.isConnected || d.open) continue;
    ozgunShowModal.call(d);
    return;
  }
}

const ozgunShowModal = HTMLDialogElement.prototype.showModal;
const ozgunClose = HTMLDialogElement.prototype.close;
const siraKontrolu = () => { if (sira.length) setTimeout(siradakiniAc, 0); };

HTMLDialogElement.prototype.showModal = function showModal() {
  if (this.open) return ozgunShowModal.call(this);
  const aciklar = acikPencereler().filter((d) => d !== this);
  if (aciklar.length && !hemenAcilabilir(this, aciklar)) {
    if (!sira.includes(this)) sira.push(this);
    return undefined;
  }
  if (rehberKapatici) rehberKapatici(false);
  return ozgunShowModal.call(this);
};
HTMLDialogElement.prototype.close = function close(/** @type {string | undefined} */ deger) {
  const i = sira.indexOf(this);
  if (i >= 0) sira.splice(i, 1);
  const sonuc = deger === undefined ? ozgunClose.call(this) : ozgunClose.call(this, deger);
  siraKontrolu();
  return sonuc;
};
// Esc ile kapanan pencere "close" olayı verir ("close" kabarmaz; yakalama evresinde belgeye yine ulaşır). Açıkken sayfadan
// kaldırılan pencere olay vermez: gövdedeki çıkarmalar da sırayı yoklar.
document.addEventListener('close', siraKontrolu, true);
new MutationObserver((kayitlar) => { if (sira.length && kayitlar.some((k) => k.removedNodes.length)) siraKontrolu(); })
  .observe(document.body, { childList: true });
for (const tur of ['pointerdown', 'keydown']) document.addEventListener(tur, (o) => { sonEtkilesim = o.target; }, true);