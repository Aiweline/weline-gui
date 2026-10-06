use crate::models::CertificateInfo;
use anyhow::{Context, Result};
use chrono::Utc;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, ClientConnection, DigitallySignedStruct, SignatureScheme};
use sha2::{Digest, Sha256};
use std::net::IpAddr;
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::Arc;
use std::time::Duration;
use x509_parser::extensions::GeneralName;
use x509_parser::{certificate::X509Certificate, parse_x509_certificate};

pub fn install_crypto_provider() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
}

#[derive(Debug)]
struct CertificateObserver;

impl ServerCertVerifier for CertificateObserver {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> std::result::Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::RSA_PKCS1_SHA1,
            SignatureScheme::ECDSA_SHA1_Legacy,
            SignatureScheme::RSA_PKCS1_SHA256,
            SignatureScheme::ECDSA_NISTP256_SHA256,
            SignatureScheme::RSA_PKCS1_SHA384,
            SignatureScheme::ECDSA_NISTP384_SHA384,
            SignatureScheme::RSA_PKCS1_SHA512,
            SignatureScheme::ECDSA_NISTP521_SHA512,
            SignatureScheme::RSA_PSS_SHA256,
            SignatureScheme::RSA_PSS_SHA384,
            SignatureScheme::RSA_PSS_SHA512,
            SignatureScheme::ED25519,
            SignatureScheme::ED448,
        ]
    }
}

pub async fn inspect_certificate(host: String, port: u16) -> Result<CertificateInfo> {
    tokio::task::spawn_blocking(move || inspect_certificate_sync(&host, port)).await?
}

fn inspect_certificate_sync(host: &str, port: u16) -> Result<CertificateInfo> {
    install_crypto_provider();
    let address = (host, port)
        .to_socket_addrs()?
        .next()
        .with_context(|| format!("unable to resolve {host}:{port}"))?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(4))?;
    stream.set_read_timeout(Some(Duration::from_secs(4)))?;
    stream.set_write_timeout(Some(Duration::from_secs(4)))?;
    let mut config = ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(CertificateObserver))
        .with_no_client_auth();
    config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
    let server_name = ServerName::try_from(host.to_string()).context("invalid TLS server name")?;
    let mut connection = ClientConnection::new(Arc::new(config), server_name)?;
    while connection.is_handshaking() {
        connection.complete_io(&mut stream)?;
    }
    let der = connection
        .peer_certificates()
        .and_then(|certificates| certificates.first())
        .context("peer did not provide a certificate")?
        .as_ref()
        .to_vec();
    let (_, parsed) =
        parse_x509_certificate(&der).map_err(|error| anyhow::anyhow!(error.to_string()))?;
    let not_before = parsed.validity().not_before.timestamp();
    let not_after = parsed.validity().not_after.timestamp();
    let now = Utc::now().timestamp();
    let fingerprint = Sha256::digest(&der)
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(":");

    Ok(CertificateInfo {
        host: host.to_string(),
        port,
        subject: parsed.subject().to_string(),
        issuer: parsed.issuer().to_string(),
        serial: parsed.raw_serial_as_string(),
        fingerprint_sha256: fingerprint,
        not_before: parsed
            .validity()
            .not_before
            .to_rfc2822()
            .unwrap_or_else(|_| not_before.to_string()),
        not_after: parsed
            .validity()
            .not_after
            .to_rfc2822()
            .unwrap_or_else(|_| not_after.to_string()),
        days_remaining: (not_after - now) / 86_400,
        valid_now: now >= not_before && now <= not_after && certificate_matches_host(&parsed, host),
    })
}

fn certificate_matches_host(certificate: &X509Certificate<'_>, host: &str) -> bool {
    let parsed_ip = host.parse::<IpAddr>().ok();
    if let Ok(Some(names)) = certificate.subject_alternative_name() {
        let mut relevant_name_present = false;
        for name in &names.value.general_names {
            let matched = match name {
                GeneralName::DNSName(pattern) if parsed_ip.is_none() => {
                    relevant_name_present = true;
                    dns_name_matches(pattern, host)
                }
                GeneralName::IPAddress(bytes) => {
                    relevant_name_present = true;
                    parsed_ip.is_some_and(|address| match address {
                        IpAddr::V4(address) => *bytes == address.octets(),
                        IpAddr::V6(address) => *bytes == address.octets(),
                    })
                }
                _ => false,
            };
            if matched {
                return true;
            }
        }
        if relevant_name_present {
            return false;
        }
    }

    parsed_ip.is_none()
        && certificate
            .subject()
            .iter_common_name()
            .filter_map(|name| name.as_str().ok())
            .any(|pattern| dns_name_matches(pattern, host))
}

fn dns_name_matches(pattern: &str, host: &str) -> bool {
    let pattern = pattern.trim_end_matches('.').to_ascii_lowercase();
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if pattern == host {
        return true;
    }
    let Some(suffix) = pattern.strip_prefix("*.") else {
        return false;
    };
    let Some(prefix) = host.strip_suffix(&format!(".{suffix}")) else {
        return false;
    };
    !prefix.is_empty() && !prefix.contains('.')
}

#[cfg(test)]
mod tests {
    use super::{dns_name_matches, install_crypto_provider};

    #[test]
    fn crypto_provider_is_selected_explicitly() {
        install_crypto_provider();
        assert!(rustls::crypto::CryptoProvider::get_default().is_some());
    }

    #[test]
    fn dns_matching_accepts_exact_and_single_label_wildcards() {
        assert!(dns_name_matches("example.com", "EXAMPLE.com"));
        assert!(dns_name_matches("*.example.com", "www.example.com"));
        assert!(!dns_name_matches("*.example.com", "deep.www.example.com"));
        assert!(!dns_name_matches("unconfigured.invalid", "example.com"));
    }
}
