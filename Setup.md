# Retro95 NAS

A retro-inspired Network Attached Storage application featuring a classic Windows 95-style interface, bringing nostalgic desktop computing to modern storage.

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.1-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/Windows-x64-blue?style=for-the-badge&logo=windows" alt="Windows">
  <img src="https://img.shields.io/badge/macOS-x64-black?style=for-the-badge&logo=apple" alt="macOS">
  <img src="https://img.shields.io/badge/Linux-x64-orange?style=for-the-badge&logo=linux" alt="Linux">
  <img src="https://img.shields.io/badge/Python-3.11%2B-yellow?style=for-the-badge&logo=python" alt="Python">
  <img src="https://img.shields.io/badge/Architecture-x86__64-informational?style=for-the-badge" alt="Architecture">
</p>

---

## Table of Contents

- [Features](#features)
- [Compatibility](#compatibility)
- [System Requirements](#system-requirements)
- [Windows Installation](#windows-installation)
- [macOS Installation](#macos-installation)
- [Linux Installation](#linux-installation)
- [First-Time Setup](#first-time-setup)
- [Network Access](#network-access)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Support](#support)

---

## Features

- Windows 95-inspired desktop interface.
- Network Attached Storage functionality.
- Cross-platform support.
- Native macOS and Linux support.
- Integrated Paint application.
- Tailscale integration.
- Retro-inspired desktop experience.

## Compatibility

| Operating System | Architecture | Compatibility |
|---|---|---|
| Windows 10 | x64 | Supported |
| Windows 11 | x64 | Supported |
| macOS | Intel x64 | Supported |
| Linux | x86_64 | Supported |
| ARM64 | ARM64 | Unsupported |
| Other architectures | Various | Unsupported |

> **Architecture limitation:** Retro95 NAS currently supports x86-64 systems only. ARM64 and other architectures are not supported.

## System Requirements

| Component | Requirement |
|---|---|
| Operating System | Windows 10/11, macOS, Linux |
| Architecture | x86-64 |
| Python | 3.11 or newer |
| Recommended Python | 3.15+ |
| RAM | 2 GB recommended |
| Storage | 200 MB free space recommended |
| Internet | Required for initial downloads |

---

# Windows Installation

Windows users can install Retro95 NAS using the official Windows installer.

No Git, manual Python installation, or command-line interaction is required.

### Step 1. Download Retro95 NAS

1. Visit the [Latest Retro95 NAS Release](https://github.com/nypryt/Retro95-NAS/releases/latest).
2. Locate the **Assets** section.
3. Download the Windows x64 installer.
4. Wait for the download to complete.

> **Important:** Download the installer from the latest release's Assets section. Do not download the source code ZIP files.

### Step 2. Open the Installer

1. Open your Downloads folder.
2. Locate the downloaded Retro95 NAS installer.
3. Double-click the installer to open it.

### Step 3. Install Retro95 NAS

1. Follow the instructions displayed by the installer.
2. Choose an installation location if requested.
3. Continue through the installation process.
4. Wait for installation to finish.

### Step 4. Launch Retro95 NAS

Once installation is complete:

1. Open Retro95 NAS from the Desktop shortcut or Start Menu, if available.
2. Allow the application to initialize.
3. Complete any first-run setup instructions.

### Step 5. Access the Interface

Open your preferred web browser and navigate to:

```text
http://localhost:4040
```

**Installation complete.**

---

# macOS Installation

Retro95 NAS supports Intel-based Macs running macOS.

### Step 1. Download the Source Code

1. Visit the [Retro95 NAS Repository](https://github.com/nypryt/Retro95-NAS).
2. Download the repository ZIP archive.
3. Extract the downloaded archive.

### Step 2. Install Python

Check whether Python is installed:

```bash
python3 --version
```

If Python 3.11 or newer is unavailable:

1. Visit [Python Downloads](https://www.python.org/downloads/macos/).
2. Download a compatible macOS x64 installer.
3. Complete the installation.

Verify:

```bash
python3 --version
```

### Step 3. Launch Retro95 NAS

Open Terminal and navigate to the extracted project directory.

Run:

```bash
python3 launcher.py
```

### Step 4. Access Retro95 NAS

Open your browser:

```text
http://localhost:4040
```

---

# Linux Installation

Retro95 NAS supports x86-64 Linux distributions.

### Option 1. ELF Installer

1. Visit the [Latest Retro95 NAS Release](https://github.com/nypryt/Retro95-NAS/releases/latest).
2. Download the Linux x64 ELF installer if available.
3. Open a terminal in the download directory.

Make the installer executable:

```bash
chmod +x ./Win95NAS-Installer.elf
```

Run the installer:

```bash
./Win95NAS-Installer.elf
```

Follow the installation instructions.

### Option 2. Run From Source

#### Step 1. Download the Source Code

1. Visit the [Retro95 NAS Repository](https://github.com/nypryt/Retro95-NAS).
2. Download the repository ZIP archive.
3. Extract the archive.

#### Step 2. Install Python

Check your existing Python installation:

```bash
python3 --version
```

If Python 3.11 or newer is unavailable, download a compatible version from:

[Python Downloads](https://www.python.org/downloads/source/)

Install Python using your distribution's supported installation method.

#### Step 3. Launch Retro95 NAS

Navigate to the extracted project directory.

Run:

```bash
python3 launcher.py
```

#### Step 4. Access the Interface

Open your browser:

```text
http://localhost:4040
```

---

## First-Time Setup

After launching Retro95 NAS:

1. Allow the application to initialize.
2. Follow the on-screen setup instructions.
3. Configure your application settings.
4. Configure your storage locations.
5. Verify that the application is running correctly.

Keep your application data and NAS storage directories intact when updating the application.

## Network Access

Retro95 NAS can be accessed through a web browser.

For local access, use:

```text
http://localhost:4040
```

To access Retro95 NAS from another device on your network, use the IP address of the computer hosting the application:

```text
http://YOUR-LOCAL-IP:4040
```

Replace `YOUR-LOCAL-IP` with the host computer's local IP address.

Ensure that:

- Both devices can communicate over the network.
- The application accepts connections from other devices.
- Your firewall permits the required connection.
- You are using the correct IP address.

## Troubleshooting

### Python Is Not Installed

For macOS and Linux source installations, check:

```bash
python3 --version
```

If Python is missing or outdated, install Python 3.11 or newer.

Windows installer users do not need to install Python separately.

### Application Does Not Launch

Make sure the application has been installed or extracted correctly.

For source installations, try launching it from the project directory:

```bash
python3 launcher.py
```

### Port 4040 Is Already in Use

Another application may already be using the default port.

Check for conflicting processes before starting Retro95 NAS.

### Cannot Access Retro95 NAS From Another Device

Check:

- Your network connection.
- Firewall configuration.
- Application listening address.
- Host computer IP address.

### Windows Installer Is Missing

1. Open the [Latest Release](https://github.com/nypryt/Retro95-NAS/releases/latest).
2. Expand the Assets section.
3. Check whether the Windows installer is available.

If the installer is missing, the release maintainer must upload the Windows installer to the release assets.

---

## Security

- Use strong authentication credentials.
- Restrict access to trusted devices.
- Keep backups of important files.
- Avoid exposing administrative interfaces directly to the public internet.
- Keep Retro95 NAS updated.
- Review network permissions carefully.

## Support

Encountered a problem or have a feature suggestion?

- [Report a Bug](https://github.com/nypryt/Retro95-NAS/issues)
- [View Source Code](https://github.com/nypryt/Retro95-NAS)
- [Download Latest Release](https://github.com/nypryt/Retro95-NAS/releases/latest)

---

## License

Retro95 NAS is distributed under the license specified in this repository.

---

<p align="center">
  <strong>Retro95 NAS</strong><br>
  Retro computing meets modern storage.
</p>
