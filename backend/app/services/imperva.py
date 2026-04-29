"""
Imperva API Client
==================
Centralises all calls to the Imperva (Thales) Cloud API.
Handles authentication, error detection (including API key expiry),
and safe ACL mutation (read-before-write).
"""
import httpx
import logging
from typing import Optional
from datetime import datetime, timezone

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ImpervaAPIError(Exception):
    """Raised when the Imperva API returns an unexpected error."""
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"Imperva API error {status_code}: {message}")


class ImpervaKeyExpiredError(ImpervaAPIError):
    """Raised specifically when the API key is expired/invalid."""
    pass


class ImpervaClient:
    def __init__(self, api_id: str, api_key: str, account_id: str,
                 base_url: str = None):
        self.api_id = api_id
        self.api_key = api_key
        self.account_id = account_id
        self.base_url = (base_url or settings.IMPERVA_API_BASE_URL).rstrip("/")
        self._client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "x-API-Id": self.api_id,
                "x-API-Key": self.api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )

    async def _request(self, method: str, path: str, **kwargs) -> dict | list:
        url = path if path.startswith("http") else f"{self.base_url}{path}"
        import os
        debug = os.environ.get("IMPERVA_DEBUG", "false").lower() in ("true", "1", "yes")

        if debug:
            params_str = str(kwargs.get("params", ""))
            body_str = str(kwargs.get("json", ""))
            logger.info(
                f"[IMPERVA DEBUG] >>> {method} {url}"
                + (f" | params={params_str}" if params_str else "")
                + (f" | body={body_str}" if body_str else "")
            )
        else:
            logger.debug(f"Imperva API {method} {url}")

        try:
            resp = await self._client.request(method, url, **kwargs)
        except httpx.RequestError as exc:
            raise ImpervaAPIError(0, f"Network error: {exc}") from exc

        if debug:
            try:
                resp_body = resp.json()
                import json
                resp_preview = json.dumps(resp_body, indent=2)[:2000]
            except Exception:
                resp_preview = resp.text[:2000]
            logger.info(
                f"[IMPERVA DEBUG] <<< {method} {url} → HTTP {resp.status_code}\n{resp_preview}"
            )

        if resp.status_code == 401:
            raise ImpervaKeyExpiredError(401, "API key is invalid or expired")
        if resp.status_code == 403:
            raise ImpervaKeyExpiredError(403, "API key lacks required permissions")
        if resp.status_code >= 400:
            raise ImpervaAPIError(resp.status_code, resp.text[:500])

        try:
            return resp.json()
        except Exception:
            return {}

    async def close(self):
        await self._client.aclose()

    # -----------------------------------------------------------------------
    # 1. Get all protected IPs / prefixes for the account
    # -----------------------------------------------------------------------
    async def get_protected_ips(self) -> list[dict]:
        """Returns list of protected IP ranges for the account."""
        result = await self._request(
            "GET",
            f"/api/v2/ddos-protection/account/{self.account_id}/protected-networks-ids"
        )
        # Normalise to always return a list of dicts
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            if "data" in result:
                return result["data"]
            if "assets" in result:
                return result["assets"]
            # Raw dict mapping ID string -> CIDR string
            return [{"assetId": k, "cidr": v} for k, v in result.items() if isinstance(v, str)]
        return []

    # -----------------------------------------------------------------------
    # 2. Poll infrastructure events (DDoS start / stop)
    # -----------------------------------------------------------------------
    async def get_infra_events(
        self,
        from_dt: datetime,
        to_dt: datetime,
        event_types: list[str] = None
    ) -> list[dict]:
        """
        Returns infra events between from_dt and to_dt.
        Uses POST /api/v1/infra/events with account_id, event_type, start, end query params.
        Filters by DDOS_START_IP_RANGE, DDOS_STOP_IP_RANGE by default.
        """
        if event_types is None:
            event_types = ["DDOS_START_IP_RANGE", "DDOS_STOP_IP_RANGE"]

        params = {
            "account_id": self.account_id,
            "event_type": ", ".join(event_types),
            "start": int(from_dt.timestamp() * 1000),
            "end": int(to_dt.timestamp() * 1000),
        }
        result = await self._request(
            "POST",
            "/api/v1/infra/events",
            params=params,
        )
        if isinstance(result, list):
            return result
        return result.get("events", [])

    # -----------------------------------------------------------------------
    # 3. Get all ACL policies for the account
    # -----------------------------------------------------------------------
    async def get_acl_policies(self) -> list[dict]:
        """Returns all ACL policies defined for the account."""
        result = await self._request(
            "GET",
            f"https://api.imperva.com/netsec-settings/netsec/v2/accounts/{self.account_id}/policies"
        )
        if isinstance(result, list):
            return result
        return result.get("data", result.get("policies", []))

    # -----------------------------------------------------------------------
    # 4. Get details of a specific ACL policy
    # -----------------------------------------------------------------------
    async def get_acl_policy_details(self, policy_id: str) -> dict:
        return await self._request(
            "GET",
            f"https://api.imperva.com/netsec-settings/netsec/v2/accounts/{self.account_id}/policies/{policy_id}"
        )

    # -----------------------------------------------------------------------
    # 5. Get current asset IDs assigned to an ACL policy
    # -----------------------------------------------------------------------
    async def get_acl_policy_assets(self, policy_id: str) -> dict:
        """Returns the assets object currently assigned to the ACL policy."""
        result = await self._request(
            "GET",
            f"https://api.imperva.com/netsec-settings/netsec/v2/policies/{policy_id}/assets"
        )
        return result if isinstance(result, dict) else {"protectedIps": [], "ipRanges": []}

    # -----------------------------------------------------------------------
    # 6. Check if ACL is applied to a specific asset
    # -----------------------------------------------------------------------
    async def is_acl_applied_on_asset(self, policy_id: str, asset_cidr: str) -> bool:
        """Returns True if the ACL policy is currently applied to the asset (CIDR)."""
        current = await self.get_acl_policy_assets(policy_id)
        return asset_cidr in current.get("ipRanges", [])

    # -----------------------------------------------------------------------
    # 7. Set (full replace) the asset list for an ACL policy — SAFE version
    # -----------------------------------------------------------------------
    async def set_acl_policy_assets(self, policy_id: str, payload: dict) -> dict:
        """Full replacement of the asset list for the given ACL policy."""
        import json, urllib.parse
        encoded_body = urllib.parse.quote(json.dumps(payload))
        return await self._request(
            "PUT",
            f"https://api.imperva.com/netsec-settings/netsec/v2/policies/{policy_id}/assets?body={encoded_body}"
        )

    async def add_asset_to_acl(self, policy_id: str, asset_cidr: str) -> dict:
        """
        Safe add: fetches current list first, appends asset_cidr if not present,
        then does a full PUT. Prevents removing other assets accidentally.
        """
        current = await self.get_acl_policy_assets(policy_id)
        ip_ranges = current.get("ipRanges", [])
        protected_ips = current.get("protectedIps", [])

        if asset_cidr not in ip_ranges:
            ip_ranges.append(asset_cidr)
            logger.info(f"Adding asset {asset_cidr} to ACL policy {policy_id}")
            
            # Map CIDRs to IDs because PUT expects IDs in ipRanges
            protected_networks = await self.get_protected_ips()
            cidr_to_id = {item["cidr"]: item["assetId"] for item in protected_networks if "cidr" in item and "assetId" in item}
            ip_range_ids = [cidr_to_id[cidr] for cidr in ip_ranges if cidr in cidr_to_id]
            
            return await self.set_acl_policy_assets(policy_id, {"protectedIps": protected_ips, "ipRanges": ip_range_ids})
        else:
            logger.info(f"Asset {asset_cidr} already in ACL policy {policy_id}, skipping")
            return {}

    async def remove_asset_from_acl(self, policy_id: str, asset_cidr: str) -> dict:
        """
        Safe remove: fetches current list first, removes asset_cidr,
        then does a full PUT.
        """
        current = await self.get_acl_policy_assets(policy_id)
        ip_ranges = current.get("ipRanges", [])
        protected_ips = current.get("protectedIps", [])

        if asset_cidr in ip_ranges:
            ip_ranges.remove(asset_cidr)
            logger.info(f"Removing asset {asset_cidr} from ACL policy {policy_id}")
            
            # Map CIDRs to IDs because PUT expects IDs in ipRanges
            protected_networks = await self.get_protected_ips()
            cidr_to_id = {item["cidr"]: item["assetId"] for item in protected_networks if "cidr" in item and "assetId" in item}
            ip_range_ids = [cidr_to_id[cidr] for cidr in ip_ranges if cidr in cidr_to_id]
            
            return await self.set_acl_policy_assets(policy_id, {"protectedIps": protected_ips, "ipRanges": ip_range_ids})
        else:
            logger.info(f"Asset {asset_cidr} not in ACL policy {policy_id}, nothing to remove")
            return {}

    # -----------------------------------------------------------------------
    # Utility: validate credentials by making a lightweight API call
    # -----------------------------------------------------------------------
    async def validate_credentials(self) -> bool:
        """Returns True if credentials are valid, raises on failure."""
        await self.get_protected_ips()
        return True
