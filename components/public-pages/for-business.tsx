import React from 'react';
import { SingleSection, CarouselSection, LandingContainer } from '@/components/landing/LandingSections';
import { BUSINESS_REGISTRATION_URL } from '@/lib/links';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'For Business | 1OS',
    description: 'Check if your South African business qualifies for zero capital expenditure solar. See the criteria, required data, and timeline.',
};

export default function ForBusinessPage() {
    return (
        <LandingContainer>
            {/* HERO - Single */}
            <SingleSection
                item={{
                    title: 'For business.\nSolar eligibility.',
                    description: 'Generocity is built for commercial and industrial entities with high energy requirements and established operational history.',
                    link: BUSINESS_REGISTRATION_URL,
                    linkText: 'Register Business',
                    buttonTheme: 'lightPanelGlassWhite',
                    bgColor: '#0b0b0b',
                    textColor: '#ffffff',
                    image: '/for-business-hero.png'
                }}
            />

            {/* DOCUMENTATION - Carousel */}
            <CarouselSection
                title="Required documentation."
                description="Have these ready before submitting your business for review. Each document is critical for our institutional partners' assessment."
                items={[
                    { tag: '01', title: 'Business registration', description: 'Company registration certificates, VAT number, and proof of physical premises address in South Africa.', cardBg: '#ffff80', image: '/business-registration.png' },
                    { tag: '02', title: 'Power Bills', description: 'Minimum 3 months of consecutive utility bills (PDF) to perform accurate load profiling and system sizing.', cardBg: '#ffb3ff', image: '/power-bills.png' },
                    { tag: '03', title: 'Financials', description: 'Optional but recommended: Latest annual financial statements to speed up the institutional funding pre-approval process.', cardBg: '#80d4ff', image: '/business-financials.png' }
                ]}
            />

            {/* EXCLUSIONS - Single */}
            <SingleSection
                item={{
                    title: 'What we cannot fund.',
                    description: 'Individual residential properties (estates/complexes ARE supported) and businesses with monthly electricity spend below R10,000.',
                    image: '/cannot-fund.png',
                    bgColor: '#f8f9fa',
                    textColor: '#000000'
                }}
            />

            {/* CTA - Single */}
            <SingleSection
                item={{
                    title: 'Ready to check eligibility?',
                    description: 'Submit your business details and we\u2019ll confirm your Generocity qualification within 72 hours.',
                    link: BUSINESS_REGISTRATION_URL,
                    linkText: 'Register interest',
                    buttonTheme: 'lightPanelGlass',
                    bgColor: '#f1f1f1',
                    textColor: '#000000',
                    image: '/business-eligibility.png'
                }}
            />
        </LandingContainer>
    );
}
