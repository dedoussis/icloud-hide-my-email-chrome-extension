import 'regenerator-runtime/runtime.js';
import fetchAdapter from '@vespaiach/axios-fetch-adapter';
import {
  getBrowserStorageValue,
  POPUP_STATE_STORAGE_KEYS,
  SESSION_DATA_STORAGE_KEYS,
  setBrowserStorageValue,
} from '../../storage';
import ICloudClient, {
  EMPTY_SESSION_DATA,
  ICloudClientSession,
  ICloudClientSessionData,
  PremiumMailSettings,
} from '../../iCloudClient';
import {
  Message,
  MessageType,
  ReservationRequestData,
  sendMessageToActiveTab,
} from '../../messages';
import { PopupState } from '../Popup/Popup';
import browser from 'webextension-polyfill';

const getClient = async (withTokenValidation = true): Promise<ICloudClient> => {
  const sessionData =
    (await getBrowserStorageValue<ICloudClientSessionData>(
      SESSION_DATA_STORAGE_KEYS
    )) || EMPTY_SESSION_DATA;

  const clientSession = new ICloudClientSession(
    sessionData,
    async (data) =>
      await setBrowserStorageValue(SESSION_DATA_STORAGE_KEYS, data)
  );
  const client = new ICloudClient(clientSession, { adapter: fetchAdapter });

  if (withTokenValidation && client.authenticated) {
    try {
      await client.validateToken();
    } catch {
      await client.logOut();
      await setBrowserStorageValue(
        POPUP_STATE_STORAGE_KEYS,
        PopupState.SignedOut
      );
    }
  }
  return client;
};

browser.runtime.onMessage.addListener(async (message: Message<unknown>) => {
  switch (message.type) {
    case MessageType.GenerateRequest:
      {
        const elementId = message.data;
        const client = await getClient();
        if (!client.authenticated) {
          await sendMessageToActiveTab(MessageType.GenerateResponse, {
            error: 'Please sign-in to iCloud.',
            elementId,
          });
          break;
        }

        const pms = new PremiumMailSettings(client);
        try {
          const hme = await pms.generateHme();
          await sendMessageToActiveTab(MessageType.GenerateResponse, {
            hme,
            elementId,
          });
        } catch (e) {
          await sendMessageToActiveTab(MessageType.GenerateResponse, {
            error: e.toString(),
            elementId,
          });
        }
      }
      break;
    case MessageType.ReservationRequest:
      {
        const { hme, label, elementId } =
          message.data as ReservationRequestData;
        const client = await getClient(false);
        if (!client.authenticated) {
          await sendMessageToActiveTab(MessageType.GenerateResponse, {
            error: 'Please sign-in to iCloud.',
            elementId,
          });
          break;
        }

        try {
          const pms = new PremiumMailSettings(client);
          await pms.reserveHme(hme, label);
          await sendMessageToActiveTab(MessageType.ReservationResponse, {
            hme,
            elementId,
          });
        } catch (e) {
          await sendMessageToActiveTab(MessageType.ReservationResponse, {
            error: e.toString(),
            elementId,
          });
        }
      }
      break;
    default:
      break;
  }
});
