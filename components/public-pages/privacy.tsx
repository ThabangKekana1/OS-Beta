/* eslint-disable react/no-unescaped-entities */
import React from 'react';
import styles from '../page.module.css';

export default function PrivacyPage() {
    return (
        <div className={styles.page}>
            <section className="section">
                <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <h1 className={styles.heroTitle} style={{ textAlign: 'left', marginBottom: 'var(--space-8)' }}>
                        Privacy Policy
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-12)' }}>
                        Last Updated: February 26, 2026
                    </p>

                    <div style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>1. Introduction</h2>
                        <p>
                            1OS ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website, use our software, or engage with our energy infrastructure services (collectively, the "Services").
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>2. Information We Collect</h2>
                        <div>
                            <p style={{ marginBottom: 'var(--space-4)' }}>We collect personal information that you provide to us directly, such as when you create an account, apply for a solar installation, or communicate with our support team. This may include:</p>
                            <ul style={{ paddingLeft: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                                <li>Name, email address, physical address, and contact number.</li>
                                <li>Business identification documents, utility bills, and financial statements for zero-CAPEX eligibility.</li>
                                <li>Site-specific energy consumption data, including historical electricity usage patterns.</li>
                                <li>Any other personal info you choose to share with us.</li>
                            </ul>
                        </div>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>3. Information Collected Automatically</h2>
                        <div>
                            <p style={{ marginBottom: 'var(--space-4)' }}>When you access our Services, we automatically collect certain information about your device and usage, including:</p>
                            <ul style={{ paddingLeft: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                                <li>IP address, browser type, operating system, and referral URLs.</li>
                                <li>Log information, such as the date and time of visits and pages viewed.</li>
                                <li>Real-time telemetry from installed energy assets (solar generation, battery state, etc.).</li>
                            </ul>
                        </div>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>4. How We Use Your Information</h2>
                        <div>
                            <p style={{ marginBottom: 'var(--space-4)' }}>We use the information we collect for various purposes, including to:</p>
                            <ul style={{ paddingLeft: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                                <li>Provide, maintain, and improve our Services and Virtual Power Plant architecture.</li>
                                <li>Process applications for energy infrastructure and coordinate physical installations.</li>
                                <li>Communicate with you about account updates, support requests, and promotional offers.</li>
                                <li>Monitor and analyze energy patterns to optimize network efficiency and stability.</li>
                                <li>Detect, prevent, and address technical issues or illegal activities.</li>
                            </ul>
                        </div>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>5. Sharing Your Information</h2>
                        <div>
                            <p style={{ marginBottom: 'var(--space-4)' }}>We do not sell your personal information. We may share your information with:</p>
                            <ul style={{ paddingLeft: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                                <li>**Institutional Partners:** Financing and banking institutions involved in zero-CAPEX agreements.</li>
                                <li>**Technical Service Providers:** Third-party contractors responsible for solar installation and hardware maintenance.</li>
                                <li>**Network Operators:** Entities involved in managing grid stability and energy distribution nodes.</li>
                                <li>**Regulatory Bodies:** Where required by law or necessary to protect our legal rights.</li>
                            </ul>
                        </div>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>6. Data Sovereignty and Security</h2>
                        <p>
                            1OS prioritizes the security of your data. We use industry-standard encryption protocols (SSL/TLS) for data in transit and robust security measures for data at rest. As part of our commitment to "Sovereign Intelligence," we aim to keep as much data processing as possible within South African infrastructure.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>7. Your Privacy Choices</h2>
                        <p>
                            You have the right to access, correct, or delete your personal information held by us. You can also opt out of certain data collection practices by contacting our support team or updating your account settings. Note that some data collection is essential for the operation of Virtual Power Plant assets.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>8. Third-Party Links</h2>
                        <p>
                            Our Services may contains links to third-party websites or services that are not owned or controlled by 1OS. We are not responsible for the privacy practices or content of these third-party sites.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>9. Children's Privacy</h2>
                        <p>
                            Our Services are not intended for children under 18. We do not knowingly collect personal info from children. If we become aware that we have collected information from a child without parental consent, we will take steps to remove that information.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>10. Changes to This Policy</h2>
                        <p>
                            We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>11. Contact Us</h2>
                        <p>
                            If you have any questions or concerns about this Privacy Policy, please contact our Privacy Officer at privacy@foundation-1.co.za.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
