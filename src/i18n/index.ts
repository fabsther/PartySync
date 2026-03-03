import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import frCommon from './locales/fr/common.json';
import frAuth from './locales/fr/auth.json';
import frParty from './locales/fr/party.json';
import frActivity from './locales/fr/activity.json';
import frLogistics from './locales/fr/logistics.json';
import frProfile from './locales/fr/profile.json';

import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enParty from './locales/en/party.json';
import enActivity from './locales/en/activity.json';
import enLogistics from './locales/en/logistics.json';
import enProfile from './locales/en/profile.json';

import esCommon from './locales/es/common.json';
import esAuth from './locales/es/auth.json';
import esParty from './locales/es/party.json';
import esActivity from './locales/es/activity.json';
import esLogistics from './locales/es/logistics.json';
import esProfile from './locales/es/profile.json';

import ruCommon from './locales/ru/common.json';
import ruAuth from './locales/ru/auth.json';
import ruParty from './locales/ru/party.json';
import ruActivity from './locales/ru/activity.json';
import ruLogistics from './locales/ru/logistics.json';
import ruProfile from './locales/ru/profile.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['fr', 'en', 'es', 'ru'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
    },
    resources: {
      fr: {
        common: frCommon,
        auth: frAuth,
        party: frParty,
        activity: frActivity,
        logistics: frLogistics,
        profile: frProfile,
      },
      en: {
        common: enCommon,
        auth: enAuth,
        party: enParty,
        activity: enActivity,
        logistics: enLogistics,
        profile: enProfile,
      },
      es: {
        common: esCommon,
        auth: esAuth,
        party: esParty,
        activity: esActivity,
        logistics: esLogistics,
        profile: esProfile,
      },
      ru: {
        common: ruCommon,
        auth: ruAuth,
        party: ruParty,
        activity: ruActivity,
        logistics: ruLogistics,
        profile: ruProfile,
      },
    },
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
