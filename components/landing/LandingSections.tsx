'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import styles from './LandingSections.module.css';

interface Item {
    title: string;
    description?: string;
    link?: string;
    linkText?: string;
    secondaryLink?: string;
    secondaryLinkText?: string;
    buttonTheme?: 'default' | 'lightPanelGlass' | 'lightPanelGlassWhite';
    tag?: string;
    image?: string;
    imagePlaceholder?: string;
    bgColor?: string;
    textColor?: string;
    cardBg?: string; // Background color for the card
}

export const LandingContainer = ({ children }: { children: React.ReactNode }) => {
    return <div className={styles.container}>{children}</div>;
};

export const SingleSection = ({ item }: { item: Item }) => {
    const textColor = item.textColor || '#000';

    // Support multi-line titles via \n
    const titleLines = item.title.split('\n');

    return (
        <section className={styles.section}>
            <div
                className={styles.single}
                style={{
                    backgroundColor: item.bgColor || '#ff8a5c',
                    color: textColor
                }}
            >
                <div className={styles.singleContent}>
                    {item.tag && <span className={styles.label}>{item.tag}</span>}
                    <h2 className={styles.sectionTitle} style={{ marginBottom: '1.5rem', fontWeight: 400, color: textColor }}>
                        {titleLines.map((line, i) => (
                            <React.Fragment key={i}>
                                {line}
                                {i < titleLines.length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </h2>
                    {item.description && <p style={{ marginBottom: '2.5rem', fontSize: '1.25rem', opacity: 0.9, lineHeight: 1.6, color: textColor }}>{item.description}</p>}
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignSelf: 'flex-start' }}>
                        {item.link && (
                            <Link href={item.link} className={`btn btn--glass btn--lg ${item.buttonTheme === 'lightPanelGlass' ? styles.singleButtonLightPanelGlass : ''} ${item.buttonTheme === 'lightPanelGlassWhite' ? styles.singleButtonLightPanelGlassWhiteText : ''}`}>
                                {item.linkText || 'Learn More'}
                            </Link>
                        )}
                        {item.secondaryLink && (
                            <Link href={item.secondaryLink} className={`btn btn--glass btn--lg ${item.buttonTheme === 'lightPanelGlass' ? styles.singleButtonLightPanelGlass : ''} ${item.buttonTheme === 'lightPanelGlassWhite' ? styles.singleButtonLightPanelGlassWhiteText : ''}`}>
                                {item.secondaryLinkText || 'Learn More'}
                            </Link>
                        )}
                    </div>
                </div>
                <div className={styles.singleImageContainer}>
                    <div
                        className={styles.singleImageShape}
                        style={!item.image ? { background: 'rgba(0,0,0,0.1)', color: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,0,0,0.1)' } : {}}
                    >
                        {item.image ? (
                            <img
                                src={item.image}
                                alt={item.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', userSelect: 'none' }}
                                draggable={false}
                            />
                        ) : (
                            'Image'
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export const DoubleSection = ({ title, items }: { title?: string, items: Item[] }) => {
    return (
        <section className={styles.section}>
            {title && <h2 className={styles.sectionTitle} style={{ color: '#fff' }}>{title}</h2>}
            <div className={styles.doubleGrid}>
                {items.slice(0, 2).map((item, idx) => (
                    <div key={idx} className={styles.doubleCard}>
                        {item.image ? (
                            <img
                                src={item.image}
                                alt={item.title}
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none' }}
                                draggable={false}
                            />
                        ) : (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '1.2rem', fontWeight: 500 }}>Image</div>
                        )}
                        <div className={styles.cardOverlay}>
                            <h3 className={styles.cardTitle}>{item.title}</h3>
                            {item.description && <p className={styles.cardDesc}>{item.description}</p>}
                            {item.link && (
                                <Link href={item.link} className="btn btn--glass btn--sm">
                                    {item.linkText || 'View'}
                                </Link>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export const CarouselSection = ({ title, description, items }: { title: string, description?: string, items: Item[] }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollStart, setScrollStart] = useState(0);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { scrollLeft, clientWidth } = scrollRef.current;
            const scrollAmount = clientWidth * 0.8;
            scrollRef.current.scrollTo({
                left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        // Only handle mouse events — let touch use native scroll
        if (e.pointerType === 'touch') return;
        if (!scrollRef.current) return;
        setIsDragging(true);
        setStartX(e.clientX);
        setScrollStart(scrollRef.current.scrollLeft);
        scrollRef.current.style.cursor = 'grabbing';
        scrollRef.current.style.scrollSnapType = 'none';
        scrollRef.current.style.scrollBehavior = 'auto';
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (e.pointerType === 'touch') return;
        if (!isDragging || !scrollRef.current) return;
        e.preventDefault();
        const walk = e.clientX - startX;
        scrollRef.current.scrollLeft = scrollStart - walk;
    }, [isDragging, startX, scrollStart]);

    const handlePointerUp = useCallback(() => {
        setIsDragging(false);
        if (scrollRef.current) {
            scrollRef.current.style.cursor = 'grab';
            scrollRef.current.style.scrollSnapType = '';
            scrollRef.current.style.scrollBehavior = '';
        }
    }, []);

    const isCarousel = items.length > 3;

    const renderCard = (item: Item, idx: number) => (
        <div
            key={idx}
            className={isCarousel ? styles.carouselCard : styles.gridCard}
            style={{ backgroundColor: item.cardBg || '#f1f1f1' }}
        >
            <div className={styles.cardTop}>
                <div className={styles.topShape}>
                    {item.image ? (
                        <img
                            src={item.image}
                            alt={item.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', userSelect: 'none' }}
                            draggable={false}
                        />
                    ) : (
                        item.imagePlaceholder || 'Image'
                    )}
                </div>
            </div>

            <div className={styles.carouselCardContent}>
                <h3 className={styles.carouselCardTitle} style={{ color: '#000' }}>{item.title}</h3>
                {item.description && <p className={styles.carouselCardDesc} style={{ color: '#000' }}>{item.description}</p>}
                {item.link && (
                    <Link href={item.link} className={`btn btn--glass ${styles.cardBtn}`}>
                        {item.linkText || 'Try It Now'}
                    </Link>
                )}
            </div>
        </div>
    );

    return (
        <section className={styles.section}>
            <div className={styles.carouselHeader}>
                <h2 className={styles.carouselTitle} style={{ color: '#fff' }}>{title}</h2>
                {description && <p className={styles.carouselSubtitle} style={{ color: '#fff' }}>{description}</p>}
            </div>

            {isCarousel ? (
                <div className={styles.carouselContainer}>
                    <div className={styles.carouselNav}>
                        <button onClick={() => scroll('left')} className={styles.navBtn} aria-label="Previous">
                            <ChevronLeft size={32} />
                        </button>
                        <button onClick={() => scroll('right')} className={styles.navBtn} aria-label="Next">
                            <ChevronRight size={32} />
                        </button>
                    </div>

                    <div
                        className={styles.carouselWrapper}
                        ref={scrollRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        style={{ cursor: 'grab', userSelect: isDragging ? 'none' : 'auto' }}
                    >
                        {items.map(renderCard)}
                    </div>
                </div>
            ) : (
                <div
                    className={styles.gridRow}
                    ref={scrollRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    style={{ userSelect: isDragging ? 'none' : 'auto' }}
                >
                    {items.map(renderCard)}
                </div>
            )}
        </section>
    );
};
