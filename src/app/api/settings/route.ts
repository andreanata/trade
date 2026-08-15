import type { NextRequest } from "next/server";
import type { UserSettings } from "@/types/market";
import { getUserKey, loadSettings, saveSettings } from "@/server/session";
import {
  dataMode,
  isMockMode,
  isMockModeConfigured,
  mockModeWarning,
  providerStatuses,
  serviceStatuses,
} from "@/providers";
import { newsVendor } from "@/server/env";
import { handleError, ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userKey = await getUserKey();
    const settings = await loadSettings(userKey);
    return ok({
      settings,
      providers: providerStatuses(),
      services: serviceStatuses(),
      mockMode: isMockMode(),
      mockModeConfigured: isMockModeConfigured(),
      warning: mockModeWarning(),
      mode: dataMode(),
      newsConfigured: newsVendor().configured,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userKey = await getUserKey();
    const body = (await request.json()) as Partial<UserSettings>;
    const settings = await saveSettings(userKey, body);
    return ok({
      settings,
      providers: providerStatuses(),
      services: serviceStatuses(),
      mockMode: isMockMode(),
      mockModeConfigured: isMockModeConfigured(),
      warning: mockModeWarning(),
      mode: dataMode(),
      newsConfigured: newsVendor().configured,
    });
  } catch (error) {
    return handleError(error);
  }
}
