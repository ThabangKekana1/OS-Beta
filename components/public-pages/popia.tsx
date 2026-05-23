/* eslint-disable react/no-unescaped-entities */
import React from 'react';
import styles from '../page.module.css';

export default function PopiaPage() {
    return (
        <div className={styles.page}>
            <section className="section">
                <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <h1 className={styles.heroTitle} style={{ textAlign: 'left', marginBottom: 'var(--space-8)' }}>
                        POPIA Compliance
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-12)' }}>
                        Last Updated: February 26, 2026
                    </p>

                    <div style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>1. What is POPIA?</h2>
                        <p>
                            The Protection of Personal Information Act ("POPIA") is South Africa's data protection law. It sets out conditions for the lawful processing of personal information by public and private bodies. 1OS is fully committed to upholding the principles of POPIA to protect our clients' and users' information.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>2. Our Information Officer</h2>
                        <div>
                            <p style={{ marginBottom: 'var(--space-4)' }}>1OS has appointed an Information Officer and Deputy Information Officers to ensure compliance with POPIA. Our Information Officer is responsible for:</p>
                            <ul style={{ paddingLeft: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                                <li>Encouraging compliance with the conditions for the lawful processing of personal information.</li>
                                <li>Dealing with requests made to the body pursuant to POPIA.</li>
                                <li>Working with the Information Regulator in relation to investigations.</li>
                                <li>Ensuring and maintaining compliance with PAIA and POPIA.</li>
                            </ul>
                        </div>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>3. Lawful Processing Principles</h2>
                        <p>
                            We adhere to the eight conditions for the lawful processing of personal information:
                            <br /><br />
                            **1. Accountability:** We ensure that all processing activities are in compliance with POPIA.
                            <br /><br />
                            **2. Processing Limitation:** We only process personal information where it is necessary, lawful, and relevant to our energy infrastructure services.
                            <br /><br />
                            **3. Purpose Specification:** Personal information is collected for specific, explicitly defined, and lawful purposes related to our business functions.
                            <br /><br />
                            **4. Further Processing Limitation:** Any further processing of personal information is only carried out if it is compatible with the original purpose of collection.
                            <br /><br />
                            **5. Information Quality:** We take reasonably practicable steps to ensure that the personal information we collect is complete, accurate, and not misleading.
                            <br /><br />
                            **6. Openness:** We maintain documentation of all processing operations and provide clear notices to data subjects about the information we collect.
                            <br /><br />
                            **7. Security Safeguards:** We implement technical and organizational measures to prevent loss, damage, or unauthorized access to personal information.
                            <br /><br />
                            **8. Data Subject Participation:** We provide mechanisms for data subjects to access, correct, or delete their personal information.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>4. Security Measures</h2>
                        <div>
                            <p style={{ marginBottom: 'var(--space-4)' }}>We employ robust security measures to protect personal information, including:</p>
                            <ul style={{ paddingLeft: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                                <li>Encryption of sensitive data both in transit and at rest.</li>
                                <li>Strict access controls based on the principle of least privilege.</li>
                                <li>Regular security audits and vulnerability assessments.</li>
                                <li>Employee training on data protection and POPIA compliance.</li>
                                <li>Physical security controls for on-site energy infrastructure hardware.</li>
                            </ul>
                        </div>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>5. Cross-Border Data Transfers</h2>
                        <p>
                            1OS strives to keep data processing within the Republic of South Africa. In instances where personal information must be transferred cross-border, we ensure that the recipient is subject to law, binding corporate rules, or binding agreements which provide an adequate level of protection that is either the same or substantially similar to the conditions for lawful processing as set out in POPIA.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>6. Data Breach Management</h2>
                        <p>
                            In the event of a security breach where personal information has been compromised, 1OS will notify the Information Regulator and the affected data subjects as soon as reasonably possible, taking into account the legitimate needs of law enforcement or any measures necessary to determine the scope of the compromise and restore the integrity of the information system.
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>7. Access and Correction</h2>
                        <div>
                            <p style={{ marginBottom: 'var(--space-4)' }}>Under POPIA, you have the right to request:</p>
                            <ul style={{ paddingLeft: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                                <li>Confirmation of whether 1OS holds your personal information.</li>
                                <li>The record or a description of the personal information held by us.</li>
                                <li>The identities of any third parties who have had access to your personal information.</li>
                            </ul>
                            <p>You may also request the correction or deletion of personal information that is inaccurate, irrelevant, excessive, out of date, incomplete, or misleading.</p>
                        </div>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>8. Complaints</h2>
                        <p>
                            If you believe 1OS has not complied with POPIA, you have the right to lodge a complaint with the Information Regulator:
                            <br /><br />
                            **The Information Regulator (South Africa)**<br />
                            JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001<br />
                            Email: complaints.IR@justice.gov.za / inforeg@justice.gov.za
                        </p>

                        <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>9. Contact Us</h2>
                        <p>
                            For any POPIA-related inquiries, please contact our Information Officer at popia@foundation-1.co.za.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
