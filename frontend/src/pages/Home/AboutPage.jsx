import React from 'react';

const AboutPage = () => {
    return (
        <div className="about-container" style={{ padding: '60px 20px', maxWidth: '1100px', margin: '0 auto' }}>
            <style>{`
                .about-flex { 
                    display: flex; 
                    gap: 50px; 
                    align-items: flex-start; /* Đổi thành flex-start để canh trên thay vì canh dưới */
                    flex-wrap: wrap; 
                }
                
                .about-text { flex: 1; min-width: 300px; }
                .about-image { flex: 1; min-width: 300px; }
                .about-image img { 
                    width: 100%; 
                    border-radius: 15px; 
                    box-shadow: 0 10px 20px rgba(0,0,0,0.1); 
                    display: block; 
                }

                .about-container h2 { 
                    color: #C0392B; 
                    font-size: 36px; 
                    margin-bottom: 25px; 
                    display: inline-block; 
                    border-bottom: 4px solid #C0392B; 
                    padding-bottom: 5px; 
                }

                .about-text p { 
                    line-height: 1.8; 
                    color: #444; 
                    font-size: 18px; 
                    text-align: justify; 
                    margin: 0 0 15px 0; 
                }
                
                .about-text p:last-child { margin-bottom: 0; }
            `}</style>
            
            <h2>Về Nhà Hàng HGH</h2>
            
            <div className="about-flex">
                <div className="about-text">
                    <p>
                        Tọa lạc tại trung tâm TP. Cần Thơ, Nhà hàng HGH là điểm đến lý tưởng cho những ai yêu thích hương vị cơm gia đình thuần túy. 
                    </p>
                    <p>   
                        Chúng tôi tự hào mang đến những món ăn không chỉ ngon miệng mà còn đảm bảo vệ sinh, được chế biến từ nguồn nguyên liệu tươi sạch đặc trưng của vùng sông nước miền Tây.
                    </p>
                    <p>
                        Với không gian ấm cúng và đội ngũ nhân viên nhiệt tình, HGH mong muốn mỗi bữa ăn của quý khách đều mang lại cảm giác thân thuộc như tại chính ngôi nhà của mình.
                    </p>
                </div>
                <div className="about-image">
                    <img src="/pics/30.jpg" alt="Không gian nhà hàng HGH" />
                </div>
            </div>
        </div>
    );
};

export default AboutPage;
