import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  isFirebaseReady,
  loginFarmer,
  registerFarmer,
  saveHarvestListing,
  updateFarmerLanguage,
} from './firebase';
import { translations } from './translations';

const initialRegistration = {
  name: '',
  phone: '',
  pin: '',
  confirmPin: '',
};

const initialLogin = {
  phone: '',
  pin: '',
};

const getTodayDate = () => new Date().toISOString().split('T')[0];

const initialHarvest = {
  cropType: '',
  customCrop: '',
  quantity: '',
  harvestDate: getTodayDate(),
  location: '',
  sellingPrice: '',
};

function encodePayload(data) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

function decodePayload(payload) {
  return JSON.parse(decodeURIComponent(escape(atob(payload))));
}

function SharedListing({ data }) {
  const content = translations[data.language] ?? translations.english;

  return (
    <div className="shared-page">
      <div className="shared-card">
        <span className="tag">{content.appName}</span>
        <h1>{content.sharedTitle}</h1>
        <p>{content.sharedSubtitle}</p>
        <div className="shared-grid">
          <div>
            <span>{content.name}</span>
            <strong>{data.name}</strong>
          </div>
                    <div>
            <span>{content.cropType}</span>
            <strong>{data.cropType}</strong>
          </div>
          <div>
            <span>{content.quantity}</span>
            <strong>{data.quantity}</strong>
          </div>
          <div>
            <span>{content.harvestDate}</span>
            <strong>{data.harvestDate}</strong>
          </div>
          <div>
            <span>{content.location}</span>
            <strong>{data.location}</strong>
          </div>
          <div>
            <span>{content.price}</span>
            <strong>{data.sellingPrice}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [sharedData, setSharedData] = useState(null);
  const [screen, setScreen] = useState('welcome');
  const [language, setLanguage] = useState('english');
  const [registration, setRegistration] = useState(initialRegistration);
  const [login, setLogin] = useState(initialLogin);
  const [farmer, setFarmer] = useState(null);
  const [harvest, setHarvest] = useState(initialHarvest);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payload = params.get('payload');

    if (payload) {
      try {
        setSharedData(decodePayload(payload));
      } catch {
        setSharedData(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!shareUrl) {
      setQrCodeUrl('');
      return;
    }

    QRCode.toDataURL(shareUrl, {}).then(setQrCodeUrl).catch(() => setMessage('Could not generate QR code.'));
  }, [shareUrl]);

  if (sharedData) {
    return <SharedListing data={sharedData} />;
  }

  const content = translations[language];
  const isOtherCrop = harvest.cropType === 'Other' || harvest.cropType === 'ÃƒÂ Ã‚Â®Ã‚Â®ÃƒÂ Ã‚Â®Ã‚Â±ÃƒÂ Ã‚Â¯Ã‚ÂÃƒÂ Ã‚Â®Ã‚Â±ÃƒÂ Ã‚Â®Ã‚ÂµÃƒÂ Ã‚Â¯Ã‹â€ ';
  const activeCrop = isOtherCrop ? harvest.customCrop : harvest.cropType;

  function updateField(setter, key, value) {
    setter((current) => ({ ...current, [key]: value }));
  }

  function goToLanguageSelection(nextFarmer, nextMessage) {
    setFarmer(nextFarmer);
    setLanguage(nextFarmer.language || 'english');
    setScreen('language');
    setMessage(nextMessage);
  }

  async function handleRegister(event) {
    event.preventDefault();

    if (!/^\d{4}$/.test(registration.pin) || !/^\d{4}$/.test(registration.confirmPin)) {
      setMessage(content.pinLengthError);
      return;
    }

    if (registration.pin !== registration.confirmPin) {
      setMessage(content.pinMatchError);
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      await registerFarmer({
        name: registration.name,
        phone: registration.phone,
        pin: registration.pin,
        language,
      });

      goToLanguageSelection(
        {
          name: registration.name,
          phone: registration.phone,
          language,
        },
        content.registerSuccess,
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      const farmerAccount = await loginFarmer(login);
      goToLanguageSelection(farmerAccount, translations[farmerAccount.language || 'english'].loginSuccess);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmLanguage(choice) {
    setLanguage(choice);

    if (!farmer) {
      setScreen('welcome');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      if (isFirebaseReady()) {
        await updateFarmerLanguage(farmer.phone, choice);
      }

      setFarmer((current) => ({ ...current, language: choice }));
      setScreen('dashboard');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateQr(event) {
    event.preventDefault();

    const cropType = activeCrop.trim();

    if (!cropType) {
      setMessage(content.cropError);
      return;
    }

    const listing = {
      name: farmer?.name ?? '',
      language,
      cropType,
      quantity: harvest.quantity,
      harvestDate: harvest.harvestDate,
      location: harvest.location,
      sellingPrice: harvest.sellingPrice,
    };

    setBusy(true);
    setMessage('');

    try {
      let listingId = 'preview';

      if (isFirebaseReady()) {
        listingId = await saveHarvestListing(listing);
      }

      const payload = encodePayload({ ...listing, listingId });
      const nextUrl = `${window.location.origin}${window.location.pathname}?payload=${encodeURIComponent(payload)}`;
      setShareUrl(nextUrl);
      setMessage(translations[language].formSuccess);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function resetToWelcome() {
    setFarmer(null);
    setLogin(initialLogin);
    setRegistration(initialRegistration);
    setHarvest({ ...initialHarvest, harvestDate: getTodayDate() });
    setShareUrl('');
    setQrCodeUrl('');
    setScreen('welcome');
  }

  function renderAuthCard(title, mode) {
    const isLogin = mode === 'login';

    return (
      <section className="card auth-card">
        <button className="text-button" type="button" onClick={() => setScreen('welcome')}>
          {content.back}
        </button>
        <h2>{title}</h2>
        <form onSubmit={isLogin ? handleLogin : handleRegister}>
          {!isLogin && (
            <label>
              <span>{content.name}</span>
              <input
                type="text"
                value={registration.name}
                onChange={(event) => updateField(setRegistration, 'name', event.target.value)}
                required
              />
            </label>
          )}

          <label>
            <span>{content.phone}</span>
            <input
              type="tel"
              inputMode="numeric"
              value={isLogin ? login.phone : registration.phone}
              onChange={(event) =>
                updateField(isLogin ? setLogin : setRegistration, 'phone', event.target.value)
              }
              required
            />
          </label>

          <label>
            <span>{content.pin}</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength="4"
              pattern="\d{4}"
              value={isLogin ? login.pin : registration.pin}
              onChange={(event) => updateField(isLogin ? setLogin : setRegistration, 'pin', event.target.value)}
              required
            />
          </label>

          {!isLogin && (
            <label>
              <span>{content.confirmPin}</span>
              <input
                type="password"
                inputMode="numeric"
                maxLength="4"
                pattern="\d{4}"
                value={registration.confirmPin}
                onChange={(event) => updateField(setRegistration, 'confirmPin', event.target.value)}
                required
              />
            </label>
          )}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? '...' : content.continue}
          </button>
        </form>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <div className="background-glow background-glow-left" />
      <div className="background-glow background-glow-right" />

      <main className="layout">
        <section className="hero-panel">
          <span className="tag">{content.appName}</span>
          <h1>{content.welcomeTitle}</h1>
          <p>{content.welcomeSubtitle}</p>
          <div className="hero-points">
            <div>
              <strong>01</strong>
              <span>Easy registration with phone number and 4 digit pin</span>
            </div>
            <div>
              <strong>02</strong>
              <span>Tamil and English app experience for farmers</span>
            </div>
            <div>
              <strong>03</strong>
              <span>Harvest details saved to Firebase with a shareable QR code</span>
            </div>
          </div>
        </section>

        {screen === 'welcome' && (
          <section className="card welcome-card">
            <h2>{content.welcomeTitle}</h2>
            <p>{content.firebaseNotice}</p>
            <div className="action-row">
              <button className="primary-button" type="button" onClick={() => setScreen('login')}>
                {content.login}
              </button>
              <button className="secondary-button" type="button" onClick={() => setScreen('register')}>
                {content.register}
              </button>
            </div>
          </section>
        )}

        {screen === 'login' && renderAuthCard(content.loginTitle, 'login')}
        {screen === 'register' && renderAuthCard(content.registerTitle, 'register')}

        {screen === 'language' && (
          <section className="card language-card">
            <button className="text-button" type="button" onClick={() => setScreen('welcome')}>
              {content.back}
            </button>
            <h2>{content.chooseLanguage}</h2>
            <p>{content.languageSubtitle}</p>
            <div className="language-grid">
              <button className="language-option" type="button" onClick={() => confirmLanguage('english')}>
                {translations.english.english}
              </button>
              <button className="language-option" type="button" onClick={() => confirmLanguage('tamil')}>
                {translations.tamil.tamil}
              </button>
            </div>
          </section>
        )}

        {screen === 'dashboard' && (
          <section className="card dashboard-card">
            <div className="card-header">
              <div>
                <span className="tag subtle-tag">{content.dashboardTitle}</span>
                <h2>{content.dashboardSubtitle}</h2>
              </div>
              <button className="text-button" type="button" onClick={resetToWelcome}>
                {content.logout}
              </button>
            </div>

            <form className="dashboard-form" onSubmit={handleGenerateQr}>
              <label>
                <span>{content.cropType}</span>
                <select
                  value={harvest.cropType}
                  onChange={(event) => updateField(setHarvest, 'cropType', event.target.value)}
                  required
                >
                  <option value="">{content.cropPlaceholder}</option>
                  {content.cropOptions.map((crop) => (
                    <option key={crop} value={crop}>
                      {crop}
                    </option>
                  ))}
                </select>
              </label>

              {isOtherCrop && (
                <label>
                  <span>{content.otherCrop}</span>
                  <input
                    type="text"
                    value={harvest.customCrop}
                    onChange={(event) => updateField(setHarvest, 'customCrop', event.target.value)}
                    required
                  />
                </label>
              )}

              <label>
                <span>{content.quantity}</span>
                <input
                  type="text"
                  value={harvest.quantity}
                  onChange={(event) => updateField(setHarvest, 'quantity', event.target.value)}
                  placeholder="100 kg"
                  required
                />
              </label>

              <label>
                <span>{content.harvestDate}</span>
                <input
                  type="date"
                  value={harvest.harvestDate}
                  onChange={(event) => updateField(setHarvest, 'harvestDate', event.target.value)}
                  required
                />
              </label>

              <label>
                <span>{content.location}</span>
                <input
                  type="text"
                  value={harvest.location}
                  onChange={(event) => updateField(setHarvest, 'location', event.target.value)}
                  placeholder="Madurai"
                  required
                />
              </label>

              <label>
                <span>{content.price}</span>
                <input
                  type="text"
                  value={harvest.sellingPrice}
                  onChange={(event) => updateField(setHarvest, 'sellingPrice', event.target.value)}
                  placeholder="Rs. 24 / kg"
                  required
                />
              </label>

              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? '...' : content.generateQr}
              </button>
            </form>

            <p className="support-text">{content.readyToSave}</p>

            {qrCodeUrl && (
              <div className="qr-panel">
                <div>
                  <h3>{content.qrTitle}</h3>
                  <p>{content.shareLink}</p>
                  <button
                    className="secondary-button qr-download-button"
                    type="button"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = qrCodeUrl;
                      link.download = 'farmer-qr-code.png';
                      link.click();
                    }}
                  >
                    {content.downloadQr}
                  </button>
                </div>
                <img src={qrCodeUrl} alt="Generated QR code" />
              </div>
            )}
          </section>
        )}

        {message && <div className="toast">{message}</div>}
      </main>
    </div>
  );
}
