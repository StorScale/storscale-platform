"""JupyterHub for the JupyterHub example: Keycloak sign-in, one container per
person, and each person's own Buckets credentials in their notebooks."""
import os

c = get_config()  # noqa: F821 (JupyterHub provides it)

# Browsers reach Keycloak through the gateway (KEYCLOAK_URL). The hub calls it
# directly: its HTTP client (libcurl) resolves *.localhost names to the hub's
# own loopback, not to the gateway. Tokens name the gateway's address either way.
KEYCLOAK = os.environ["KEYCLOAK_URL"] + "/realms/lakehouse/protocol/openid-connect"
KEYCLOAK_DIRECT = "http://keycloak:8080/realms/lakehouse/protocol/openid-connect"

# --- Sign-in: Keycloak, through OpenID Connect ---------------------------------------
c.JupyterHub.authenticator_class = "generic-oauth"
c.GenericOAuthenticator.client_id = "jupyterhub"
c.GenericOAuthenticator.client_secret = os.environ["JUPYTERHUB_OAUTH_SECRET"]
c.GenericOAuthenticator.oauth_callback_url = os.environ["NOTEBOOKS_URL"] + "/hub/oauth_callback"
c.GenericOAuthenticator.authorize_url = f"{KEYCLOAK}/auth"
c.GenericOAuthenticator.token_url = f"{KEYCLOAK_DIRECT}/token"
c.GenericOAuthenticator.userdata_url = f"{KEYCLOAK_DIRECT}/userinfo"
c.GenericOAuthenticator.logout_redirect_url = f"{KEYCLOAK}/logout"
c.GenericOAuthenticator.scope = ["openid", "profile", "email"]
c.GenericOAuthenticator.username_claim = "preferred_username"

# Keycloak's groups decide who may sign in and who runs the hub. The hub
# mirrors them as JupyterHub groups (manage_groups) on every sign-in.
c.GenericOAuthenticator.manage_groups = True
c.GenericOAuthenticator.auth_state_groups_key = "oauth_user.groups"
c.GenericOAuthenticator.allowed_groups = {"analysts", "engineers"}
c.GenericOAuthenticator.admin_groups = {"engineers"}

# Keep each person's tokens (encrypted with JUPYTERHUB_CRYPT_KEY) and refresh
# them with Keycloak's refresh token, so notebooks can always get a current one.
c.GenericOAuthenticator.enable_auth_state = True
c.GenericOAuthenticator.refresh_pre_spawn = True
c.GenericOAuthenticator.auth_refresh_age = 120

# A notebook server's own API token may read its person's tokens, and nothing
# of anyone else's: buckets_lake uses this to get Buckets credentials. A
# server's token can only hold scopes its person holds, so people get the
# scope for their own tokens too (admins already have it).
c.JupyterHub.load_roles = [
    {"name": "user", "scopes": ["self", "admin:auth_state!user"]},
    {"name": "server",
     "scopes": ["users:activity!user", "access:servers!server", "read:users:name!user", "admin:auth_state!user"]},
]

# --- Notebooks: a container per person -------------------------------------------------
c.JupyterHub.spawner_class = "docker"
c.DockerSpawner.image = "storscale-notebook"
c.DockerSpawner.network_name = "storscale"
c.DockerSpawner.remove = True
c.DockerSpawner.mem_limit = "1G"
c.DockerSpawner.notebook_dir = "/home/jovyan/work"
c.DockerSpawner.volumes = {"storscale-notebooks-{username}": "/home/jovyan/work"}
c.DockerSpawner.environment = {"BUCKETS_ENDPOINT": "http://buckets:9000", "BUCKETS_REGION": "us-east-1"}
c.Spawner.start_timeout = 120

c.JupyterHub.hub_ip = "0.0.0.0"
c.JupyterHub.hub_connect_ip = "jupyterhub"
c.JupyterHub.cookie_secret_file = "/srv/jupyterhub/data/cookie_secret"
c.JupyterHub.db_url = "sqlite:////srv/jupyterhub/data/jupyterhub.sqlite"
