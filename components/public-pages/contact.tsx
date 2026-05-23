'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

export default function ContactPage() {
    const [formData, setFormData] = useState({
        companySize: '',
        companyName: '',
        firstName: '',
        lastName: '',
        workEmail: '',
        phoneNumber: '',
        interest: '',
        businessNeeds: '',
        marketingConsent: true
    });
    const [submitted, setSubmitted] = useState(false);

    function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const checked = (e.target as HTMLInputElement).checked;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        console.log('Form submitted:', formData);
        setSubmitted(true);
    }

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.topBanner}>
                    Have a small team? Get started with <Link href="/for-business" className={styles.bannerLink}>1OS Business</Link>.
                </div>

                {submitted ? (
                    <div className={styles.successMessage}>
                        <h2 className={styles.successTitle}>Thank you for reaching out.</h2>
                        <p className={styles.successText}>Our team will get back to you shortly.</p>
                        <button className={styles.submitBtn} onClick={() => setSubmitted(false)}>
                            Send another message
                        </button>
                    </div>
                ) : (
                    <form className={styles.form} onSubmit={handleSubmit}>
                        <div className={styles.field}>
                            <label className={styles.label}>Company size *</label>
                            <select
                                name="companySize"
                                required
                                value={formData.companySize}
                                onChange={handleChange}
                                className={styles.select}
                            >
                                <option value="">Please Select</option>
                                <option value="1-10">1-10</option>
                                <option value="11-50">11-50</option>
                                <option value="51-200">51-200</option>
                                <option value="201-500">201-500</option>
                                <option value="500+">500+</option>
                            </select>
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>Company name *</label>
                            <input
                                name="companyName"
                                type="text"
                                required
                                value={formData.companyName}
                                onChange={handleChange}
                                className={styles.input}
                            />
                        </div>

                        <div className={styles.row}>
                            <div className={styles.field}>
                                <label className={styles.label}>First name *</label>
                                <input
                                    name="firstName"
                                    type="text"
                                    required
                                    value={formData.firstName}
                                    onChange={handleChange}
                                    className={styles.input}
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>Last name *</label>
                                <input
                                    name="lastName"
                                    type="text"
                                    required
                                    value={formData.lastName}
                                    onChange={handleChange}
                                    className={styles.input}
                                />
                            </div>
                        </div>

                        <div className={styles.row}>
                            <div className={styles.field}>
                                <label className={styles.label}>Work email *</label>
                                <input
                                    name="workEmail"
                                    type="email"
                                    required
                                    value={formData.workEmail}
                                    onChange={handleChange}
                                    className={styles.input}
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>Phone number *</label>
                                <input
                                    name="phoneNumber"
                                    type="tel"
                                    required
                                    value={formData.phoneNumber}
                                    onChange={handleChange}
                                    className={styles.input}
                                />
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>Which of our products or services are you interested in? *</label>
                            <select
                                name="interest"
                                required
                                value={formData.interest}
                                onChange={handleChange}
                                className={styles.select}
                            >
                                <option value="">Select one from the dropdown options below</option>
                                <option value="generocity">Generocity</option>
                                <option value="lumen">Lumen</option>
                                <option value="providence">Providence Research</option>
                                <option value="other">Other</option>
                            </select>
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>Can you share more about your business needs and challenges?</label>
                            <textarea
                                name="businessNeeds"
                                value={formData.businessNeeds}
                                onChange={handleChange}
                                className={styles.textarea}
                            />
                        </div>

                        <div className={styles.checkboxWrapper}>
                            <input
                                id="marketing"
                                name="marketingConsent"
                                type="checkbox"
                                checked={formData.marketingConsent}
                                onChange={handleChange}
                                className={styles.checkbox}
                            />
                            <label htmlFor="marketing" className={styles.checkboxLabel}>
                                I would like to receive marketing communications from 1OS via email about its products, services and events. If you do not want to receive marketing communications, please uncheck this box.
                            </label>
                        </div>

                        <button type="submit" className={styles.submitBtn}>
                            Submit
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
