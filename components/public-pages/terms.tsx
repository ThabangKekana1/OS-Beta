/* eslint-disable react/no-unescaped-entities */
import React from 'react';
import styles from '../page.module.css';

export default function TermsPage() {
    return (
        <div className={styles.page}>
            <section className="section">
                <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <h1 className={styles.heroTitle} style={{ textAlign: 'left', marginBottom: 'var(--space-8)' }}>
                        Terms of Service
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-12)' }}>
                        Last Updated: February 26, 2026
                    </p>

                    <div style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>1. Introduction</h2>
                        <p>
                            Welcome to 1OS. These Terms of Service ("Terms") govern your access to and use of the 1OS website, services, and applications (collectively, the "Service"). By accessing or using our Service, you agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms, please do not use our Service.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>2. Our Services</h2>
                        <p>
                            1OS provides an infrastructure layer designed to facilitate the transition to renewable energy in South Africa. Our core offerings include zero-capital expenditure solar solutions, Virtual Power Plant (VPP) architecture, and specialized energy infrastructure for high-performance computing and AI data centers.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>3. User Eligibility and Accounts</h2>
                        <p>
                            To use certain features of the Service, you must register for an account. You represent and warrant that the information you provide is accurate and complete. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must be at least 18 years of age to use our Services or have the express consent of a legal guardian.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>4. Zero-CAPEX Solar Model</h2>
                        <p>
                            Our zero-capital expenditure model is subject to specific contractual agreements between 1OS and the business entity. Acceptance into this program is based on creditworthiness, site feasibility, and energy consumption profiles. All hardware remains the property of 1OS or its financing partners unless otherwise specified in a separate Purchase Option agreement.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>5. Virtual Power Plant (VPP) Participation</h2>
                        <p>
                            By participating in the 1OS energy network, you agree to the aggregation of your energy generation and storage assets into our VPP architecture. 1OS manages the dispatch of these assets to optimize grid stability and network efficiency. Users will receive compensation or credits as outlined in their specific service level agreements.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>6. Prohibited Conduct</h2>
                        <div>
                            <p style={{ marginBottom: 'var(--space-4)' }}>You agree not to:</p>
                            <ul style={{ paddingLeft: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                                <li>Use the Service for any illegal purpose or in violation of any local, state, national, or international law.</li>
                                <li>Violate or encourage others to violate the rights of third parties, including intellectual property rights.</li>
                                <li>Interfere with security-related features of the Service.</li>
                                <li>Engage in any activity that disrupts or interferes with the proper functioning of the 1OS energy network.</li>
                                <li>Attempt to decipher, decompile, disassemble, or reverse engineer any of the software used to provide the Service.</li>
                            </ul>
                        </div>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>7. Intellectual Property</h2>
                        <p>
                            The Service, including all text, graphics, logos, and software, is the property of 1OS and is protected by copyright, trademark, and other laws. You are granted a limited, non-exclusive, non-transferable license to access and use the Service for its intended purpose.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>8. Limitation of Liability</h2>
                        <p>
                            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, 1OS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>9. Termination</h2>
                        <p>
                            We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will immediately cease.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>10. Governing Law</h2>
                        <p>
                            These Terms shall be governed and construed in accordance with the laws of the Republic of South Africa, without regard to its conflict of law provisions.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>11. Changes to Terms</h2>
                        <p>
                            We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>12. Contact Us</h2>
                        <p>
                            If you have any questions about these Terms, please contact us at legal@foundation-1.co.za.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
