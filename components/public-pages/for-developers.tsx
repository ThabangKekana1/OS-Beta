import React from 'react';
import { SingleSection, CarouselSection, LandingContainer } from '@/components/landing/LandingSections';
import { BUSINESS_REGISTRATION_URL } from '@/lib/links';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'For Developers | 1OS',
    description: 'Learn how Generocity provides zero capital expenditure solar solutions for property developers in South Africa.',
};

export default function ForDevelopersPage() {
    return (
        <LandingContainer>
            {/* HERO - Single */}
            <SingleSection
                item={{
                    title: 'For developers.\nSolar for projects.',
                    description: 'Generocity partners with property developers to integrate fully funded solar solutions into new and existing commercial developments.',
                    link: BUSINESS_REGISTRATION_URL,
                    linkText: 'Register Project',
                    buttonTheme: 'lightPanelGlassWhite',
                    bgColor: '#0b0b0b',
                    textColor: '#ffffff',
                    image: '/for-developers-hero-v2.jpg'
                }}
            />

            {/* VALUE - Carousel */}
            <CarouselSection
                title="Why partner with us?"
                description="Enhance your property value and sustainability profile with zero upfront investment."
                items={[
                    { title: 'Zero Capex', description: 'Install state-of-the-art solar systems without impacting your development budget or financing facilities.', cardBg: '#ffff80', image: '/zero-capex-skyscraper.png' },
                    { title: 'Project Valuation', description: 'Properties with sustainable energy infrastructure command higher valuations and attract premium tenants.', cardBg: '#ffb3ff', image: '/project-valuation.png' },
                    { title: 'ESG Compliance', description: 'Meet and exceed Environmental, Social, and Governance (ESG) targets for your real estate portfolio.', cardBg: '#80d4ff', image: '/esg-compliance.png' },
                    { title: 'Tenant Advantage', description: 'Provide tenants with reduced energy costs and reliable green power from the day they move in.', cardBg: '#b3ffb3', image: '/tenant-advantage.png' }
                ]}
            />

            {/* PROCESS - Carousel */}
            <CarouselSection
                title="Integration process."
                description="Seamless integration from design phase to property management."
                items={[
                    { tag: '01', title: 'Design Integration', description: 'Our engineers work with your architects to optimize roof layout and electrical integration during the planning phase.', cardBg: '#e6ccff', image: '/design-integration.png' },
                    { tag: '02', title: 'Funding & Legal', description: 'We handle the entire funding process via our banking partners and structure simple PPA or lease agreements.', cardBg: '#ffccd5', image: '/funding-legal.png' },
                    { tag: '03', title: 'Implementation', description: 'Professional installation managed by 1OS and our certified engineering partners, timed perfectly with your construction schedule.', cardBg: '#d1f2eb', image: '/implementation.png' }
                ]}
            />

            {/* CTA - Single */}
            <SingleSection
                item={{
                    title: 'Ready to enhance your development?',
                    description: 'Speak to our development team about integrating Generocity solar into your next commercial or industrial project.',
                    link: BUSINESS_REGISTRATION_URL,
                    linkText: 'Register Project Interest',
                    buttonTheme: 'lightPanelGlass',
                    bgColor: '#f1f1f1',
                    textColor: '#000000',
                    image: '/for-developers-footer.jpg'
                }}
            />
        </LandingContainer>
    );
}
